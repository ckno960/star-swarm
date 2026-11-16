#pragma once

#include <juce_audio_processors/juce_audio_processors.h>
#include "PluginProcessor.h"

// 큰 세로 슬라이더 하나와, 지금 켜진 효과를 보여주는 표시
class SkyriseLook : public juce::LookAndFeel_V4
{
public:
    void drawLinearSlider (juce::Graphics&, int x, int y, int width, int height,
                           float sliderPos, float minSliderPos, float maxSliderPos,
                           juce::Slider::SliderStyle, juce::Slider&) override;
    // 손잡이 반지름만큼 슬라이더 안쪽에서 움직이게 해 위아래 끝에서 잘리지 않게
    int getSliderThumbRadius (juce::Slider&) override { return 16; }
};

class SkyriseEditor : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    explicit SkyriseEditor (SkyriseProcessor&);
    ~SkyriseEditor() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;

    SkyriseProcessor& processor;
    SkyriseLook look;
    juce::Slider rise;
    juce::AudioProcessorValueTreeState::SliderAttachment attachment;
    float shown = 0.0f;   // 화면에 마지막으로 그린 세기 (0~1)

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (SkyriseEditor)
};
