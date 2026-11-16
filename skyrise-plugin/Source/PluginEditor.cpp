#include "PluginEditor.h"

namespace
{
const juce::Colour night { 0xff0e1530 };
const juce::Colour dusk { 0xff3a1f5c };
const juce::Colour sun { 0xffff8a3d };
const juce::Colour glow { 0xffffd166 };
const juce::Colour dim { 0xff7f8bb3 };

// 세기에 따라 밤하늘 → 노을 → 해 뜨는 색으로
juce::Colour skyAt (float a)
{
    return a < 0.5f ? night.interpolatedWith (dusk, a * 2.0f) : dusk.interpolatedWith (sun.darker (0.6f), (a - 0.5f) * 2.0f);
}
} // namespace

void SkyriseLook::drawLinearSlider (juce::Graphics& g, int x, int y, int width, int height,
                                    float sliderPos, float, float, juce::Slider::SliderStyle, juce::Slider&)
{
    // JUCE가 넘겨주는 영역은 손잡이 반지름만큼 줄어 있어서, 막대는 그만큼 위아래로 늘려 그린다
    const auto track = juce::Rectangle<float> ((float) x, (float) y, (float) width, (float) height)
                           .expanded (0.0f, 16.0f).withSizeKeepingCentre (56.0f, (float) height + 32.0f);
    g.setColour (juce::Colours::black.withAlpha (0.35f));
    g.fillRoundedRectangle (track, 28.0f);

    // 슬라이더 아래부터 손잡이까지 채운다 (둥근 막대 모양 안쪽만)
    {
        juce::Graphics::ScopedSaveState state (g);
        juce::Path shape;
        shape.addRoundedRectangle (track, 28.0f);
        g.reduceClipRegion (shape);
        const auto filled = track.withTop (sliderPos);
        g.setGradientFill (juce::ColourGradient (glow, filled.getX(), filled.getY(), sun.withAlpha (0.6f), filled.getX(), track.getBottom(), false));
        g.fillRect (filled);
    }

    const auto thumb = juce::Rectangle<float> (track.getX() - 14.0f, sliderPos - 14.0f, track.getWidth() + 28.0f, 28.0f);
    g.setColour (juce::Colours::white);
    g.fillRoundedRectangle (thumb, 14.0f);
    g.setColour (night.withAlpha (0.5f));
    for (int i = -1; i <= 1; ++i)
        g.fillRect (thumb.getCentreX() - 14.0f, thumb.getCentreY() + i * 5.0f - 0.75f, 28.0f, 1.5f);
}

SkyriseEditor::SkyriseEditor (SkyriseProcessor& p)
    : AudioProcessorEditor (&p), processor (p), attachment (p.params, "amount", rise)
{
    rise.setSliderStyle (juce::Slider::LinearVertical);
    rise.setTextBoxStyle (juce::Slider::NoTextBox, false, 0, 0);
    rise.setLookAndFeel (&look);
    rise.setDoubleClickReturnValue (true, 0.0);
    addAndMakeVisible (rise);
    setSize (340, 540);
    startTimerHz (30);
}

SkyriseEditor::~SkyriseEditor()
{
    rise.setLookAndFeel (nullptr);
}

void SkyriseEditor::timerCallback()
{
    const auto a = (float) rise.getValue() / 100.0f;
    if (std::abs (a - shown) > 0.001f)
    {
        shown = a;
        repaint();
    }
}

void SkyriseEditor::paint (juce::Graphics& g)
{
    const auto a = shown;
    const auto bounds = getLocalBounds().toFloat();
    g.setGradientFill (juce::ColourGradient (night, 0, 0, skyAt (a), 0, bounds.getBottom(), false));
    g.fillAll();

    g.setColour (juce::Colours::white);
    g.setFont (juce::FontOptions (26.0f, juce::Font::bold));
    g.drawText ("SKYRISE", getLocalBounds().removeFromTop (60), juce::Justification::centred);

    g.setColour (glow);
    g.setFont (juce::FontOptions (44.0f, juce::Font::bold));
    g.drawText (juce::String (juce::roundToInt (a * 100.0f)) + "%", 0, 54, getWidth(), 50, juce::Justification::centred);

    // 오른쪽 열: 지금 켜진 효과. 꺼진 것은 흐리게
    const auto s = skyrise::settingsFor (a);
    const auto gateName = s.gateBeats >= 0.5 ? "1/8" : s.gateBeats >= 0.25 ? "1/16" : "1/32";
    struct Tag { juce::String text; bool on; };
    const Tag tags[] = {
        { "FILTER " + juce::String (juce::roundToInt (s.highpassHz)) + " Hz", s.highpassHz > 40.0f },
        { "REVERB", s.reverbWet > 0.02f },
        { "ECHO", s.echoWet > 0.02f },
        { "NOISE", s.noiseGain > 0.004f },
        { juce::String ("GATE ") + gateName, s.gateDepth > 0.02f },
        { "PITCH +" + juce::String (s.pitchSemis, 1), s.pitchMix > 0.02f },
    };
    g.setFont (juce::FontOptions (14.0f, juce::Font::bold));
    auto y = 140.0f;
    for (const auto& t : tags)
    {
        const auto row = juce::Rectangle<float> (196.0f, y, 128.0f, 30.0f);
        g.setColour (t.on ? glow.withAlpha (0.18f) : juce::Colours::black.withAlpha (0.15f));
        g.fillRoundedRectangle (row, 8.0f);
        g.setColour (t.on ? glow : dim);
        g.drawText (t.text, row.reduced (10.0f, 0.0f), juce::Justification::centredLeft);
        y += 40.0f;
    }

    g.setColour (dim);
    g.setFont (juce::FontOptions (12.0f));
    g.drawText ("Automate RISE up for the build, drop it to 0 at the drop", getLocalBounds().removeFromBottom (34), juce::Justification::centred);
}

void SkyriseEditor::resized()
{
    rise.setBounds (40, 130, 120, 360);
}
