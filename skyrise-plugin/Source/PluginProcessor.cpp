#include "PluginProcessor.h"
#include "PluginEditor.h"

SkyriseProcessor::SkyriseProcessor()
    : AudioProcessor (BusesProperties()
                          .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                          .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      params (*this, nullptr, "Skyrise", createLayout())
{
    amountParam = params.getRawParameterValue ("amount");
}

// 오토메이션할 파라미터는 Rise(0~100%) 하나뿐
juce::AudioProcessorValueTreeState::ParameterLayout SkyriseProcessor::createLayout()
{
    juce::AudioProcessorValueTreeState::ParameterLayout layout;
    layout.add (std::make_unique<juce::AudioParameterFloat> (
        juce::ParameterID { "amount", 1 }, "Rise",
        juce::NormalisableRange<float> (0.0f, 100.0f, 0.1f), 0.0f,
        juce::AudioParameterFloatAttributes().withLabel ("%")));
    return layout;
}

void SkyriseProcessor::prepareToPlay (double sampleRate, int samplesPerBlock)
{
    engine.prepare (sampleRate, samplesPerBlock);
    engine.setAmount (amountParam->load() / 100.0f);
    engine.reset();
}

bool SkyriseProcessor::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto out = layouts.getMainOutputChannelSet();
    if (out != juce::AudioChannelSet::mono() && out != juce::AudioChannelSet::stereo())
        return false;
    return layouts.getMainInputChannelSet() == out;
}

void SkyriseProcessor::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;
    for (auto ch = getTotalNumInputChannels(); ch < getTotalNumOutputChannels(); ++ch)
        buffer.clear (ch, 0, buffer.getNumSamples());

    // 게이트·에코를 곡 템포에 맞춘다. 재생 중이 아니면 ppq를 -1로 넘겨 내부 시계를 쓴다
    double bpm = 128.0, ppq = -1.0;
    if (auto* head = getPlayHead())
    {
        if (const auto pos = head->getPosition())
        {
            if (const auto b = pos->getBpm()) bpm = *b;
            if (pos->getIsPlaying())
                if (const auto p = pos->getPpqPosition()) ppq = *p;
        }
    }

    engine.setAmount (amountParam->load() / 100.0f);
    engine.process (buffer, bpm, ppq);
}

void SkyriseProcessor::getStateInformation (juce::MemoryBlock& destData)
{
    if (auto xml = params.copyState().createXml())
        copyXmlToBinary (*xml, destData);
}

void SkyriseProcessor::setStateInformation (const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
        if (xml->hasTagName (params.state.getType()))
            params.replaceState (juce::ValueTree::fromXml (*xml));
}

juce::AudioProcessorEditor* SkyriseProcessor::createEditor()
{
    return new SkyriseEditor (*this);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new SkyriseProcessor();
}
