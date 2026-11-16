#pragma once

#include <juce_dsp/juce_dsp.h>

// 슬라이더 하나(amount 0~1)로 빌드업 효과를 함께 올리는 소리 처리.
// 순서: 하이패스 필터 → 피치 상승 레이어 → 게이트 → 노이즈 라이저 → 에코 → 리버브
// 화면·호스트와 분리돼 있어서 DAW 없이도 테스트할 수 있다.

namespace skyrise
{

// amount 하나에서 각 효과의 세기를 정한다
struct Settings
{
    float highpassHz;    // 하이패스 차단 주파수
    float highpassQ;
    float highpassMix;   // 0%에서는 필터를 완전히 빼서 원음과 똑같게
    float gateDepth;     // 0이면 게이트 없음, 1이면 꺼지는 칸이 완전히 무음
    double gateBeats;    // 게이트 한 칸 길이(박). 0.5 = 8분음표
    float pitchSemis;    // 피치 레이어가 올라가는 반음 수
    float pitchMix;      // 피치 레이어 섞는 양
    float noiseGain;     // 화이트 노이즈 라이저 크기
    float noiseHz;       // 노이즈 밴드패스 중심 주파수
    float echoWet;
    float echoFeedback;
    float reverbWet;
    float reverbRoom;
    float outputGain;
};

inline float smoothstep (float edge0, float edge1, float x)
{
    const auto t = juce::jlimit (0.0f, 1.0f, (x - edge0) / (edge1 - edge0));
    return t * t * (3.0f - 2.0f * t);
}

inline Settings settingsFor (float amount)
{
    const auto a = juce::jlimit (0.0f, 1.0f, amount);
    Settings s {};
    // 20Hz(거의 투명) → 2kHz까지 지수로 올라간다
    s.highpassHz = 20.0f * std::pow (100.0f, std::pow (a, 1.5f));
    s.highpassQ = 0.707f + 0.6f * a;
    s.highpassMix = smoothstep (0.0f, 0.05f, a);
    s.gateDepth = smoothstep (0.3f, 0.7f, a);
    s.gateBeats = a < 0.55f ? 0.5 : a < 0.75f ? 0.25 : 0.125;
    s.pitchSemis = 12.0f * smoothstep (0.45f, 1.0f, a);
    s.pitchMix = 0.5f * smoothstep (0.45f, 0.9f, a);
    const auto n = smoothstep (0.2f, 1.0f, a);
    s.noiseGain = 0.15f * n * n;
    s.noiseHz = 500.0f * std::pow (16.0f, a);
    s.echoWet = 0.35f * smoothstep (0.15f, 0.9f, a);
    s.echoFeedback = 0.2f + 0.4f * a;
    s.reverbWet = 0.5f * smoothstep (0.1f, 1.0f, a);
    s.reverbRoom = 0.5f + 0.45f * a;
    // 효과가 쌓일수록 소리가 커지므로 출력을 줄여 DAW에서 찢어지지 않게
    s.outputGain = 1.0f - 0.45f * smoothstep (0.0f, 1.0f, a);
    return s;
}

// 지연선 두 개를 엇갈려 읽어 음높이를 바꾸는 단순한 피치 시프터 (Hann 창으로 겹쳐 이음)
class PitchShifter
{
public:
    void prepare (double sampleRate)
    {
        window = juce::jmax (64, (int) (sampleRate * 0.04));
        buffer.assign ((size_t) (window * 2 + 4), 0.0f);
        reset();
    }

    void reset()
    {
        std::fill (buffer.begin(), buffer.end(), 0.0f);
        write = 0;
        phase = 0.0;
    }

    float process (float x, float ratio)
    {
        const auto size = (int) buffer.size();
        buffer[(size_t) write] = x;
        // ratio > 1(음이 올라감)이면 지연이 줄어드는 쪽으로 돈다
        phase += (1.0 - ratio) / window;
        phase -= std::floor (phase);
        const auto p2 = std::fmod (phase + 0.5, 1.0);
        const auto y = read (phase * window + 1.0, size) * hann (phase)
                     + read (p2 * window + 1.0, size) * hann (p2);
        write = (write + 1) % size;
        return (float) y;
    }

private:
    static double hann (double p) { return 0.5 - 0.5 * std::cos (juce::MathConstants<double>::twoPi * p); }

    double read (double delay, int size) const
    {
        auto pos = write - delay;
        while (pos < 0) pos += size;
        const auto i = (int) pos;
        const auto frac = pos - i;
        const auto a = buffer[(size_t) (i % size)];
        const auto b = buffer[(size_t) ((i + 1) % size)];
        return a + (b - a) * frac;
    }

    std::vector<float> buffer;
    int window = 1764, write = 0;
    double phase = 0.0;
};

class BuildupEngine
{
public:
    static constexpr int maxChannels = 2;
    static constexpr int subBlock = 32;   // 효과 세기는 32샘플마다 다시 정한다

    void prepare (double newSampleRate, int maxBlockSize)
    {
        sampleRate = newSampleRate;
        const juce::dsp::ProcessSpec spec { sampleRate, (juce::uint32) maxBlockSize, (juce::uint32) maxChannels };
        highpass.prepare (spec);
        highpass.setType (juce::dsp::StateVariableTPTFilterType::highpass);
        noiseFilter.prepare ({ sampleRate, (juce::uint32) maxBlockSize, 1 });
        noiseFilter.setType (juce::dsp::StateVariableTPTFilterType::bandpass);
        noiseFilter.setResonance (1.2f);
        for (auto& p : pitch) p.prepare (sampleRate);
        echo.prepare (spec);
        echo.setMaximumDelayInSamples ((int) (sampleRate * 3.0));
        reverb.prepare (spec);
        reverbBuffer.setSize (maxChannels, maxBlockSize);
        amount.reset (sampleRate, 0.05);
        gateGain.reset (sampleRate, 0.003);
        reset();
    }

    void reset()
    {
        highpass.reset();
        noiseFilter.reset();
        for (auto& p : pitch) p.reset();
        echo.reset();
        reverb.reset();
        freeBeats = 0.0;
        amount.setCurrentAndTargetValue (amount.getTargetValue());
        gateGain.setCurrentAndTargetValue (1.0f);
    }

    void setAmount (float a) { amount.setTargetValue (juce::jlimit (0.0f, 1.0f, a)); }
    float getAmount() const { return amount.getCurrentValue(); }

    // bpm: 호스트 템포. ppq: 이 블록 첫 샘플의 재생 위치(박). 재생 중이 아니면 음수 → 내부 시계로 게이트를 돌린다
    void process (juce::AudioBuffer<float>& buffer, double bpm, double ppq)
    {
        const auto channels = juce::jmin (buffer.getNumChannels(), maxChannels);
        const auto samples = buffer.getNumSamples();
        if (channels == 0 || samples == 0) return;

        const auto beatsPerSample = juce::jmax (30.0, bpm) / 60.0 / sampleRate;
        const auto startBeats = ppq >= 0.0 ? ppq : freeBeats;

        // 리버브는 원음을 따로 보내 젖은 소리만 받아 더한다
        reverbBuffer.setSize (maxChannels, samples, false, false, true);
        reverbBuffer.clear();

        for (int start = 0; start < samples; start += subBlock)
        {
            const auto n = juce::jmin (subBlock, samples - start);
            const auto a = amount.skip (n);
            const auto s = settingsFor (a);
            highpass.setCutoffFrequency (juce::jmin (s.highpassHz, (float) (sampleRate * 0.45)));
            highpass.setResonance (s.highpassQ);
            noiseFilter.setCutoffFrequency (juce::jmin (s.noiseHz, (float) (sampleRate * 0.45)));
            const auto ratio = std::pow (2.0f, s.pitchSemis / 12.0f);
            const auto echoDelay = (float) (0.75 * 60.0 / juce::jmax (30.0, bpm) * sampleRate);   // 점8분음표
            echo.setDelay (juce::jmin (echoDelay, (float) (sampleRate * 2.9)));

            juce::dsp::Reverb::Parameters rp;
            rp.roomSize = s.reverbRoom;
            rp.damping = 0.35f;
            rp.width = 1.0f;
            rp.wetLevel = 1.0f;
            rp.dryLevel = 0.0f;
            reverb.setParameters (rp);

            for (int i = start; i < start + n; ++i)
            {
                // 게이트: 칸의 앞 절반은 켜고 뒤 절반은 depth만큼 줄인다
                const auto beat = startBeats + i * beatsPerSample;
                const auto inStep = std::fmod (beat, s.gateBeats) / s.gateBeats;
                gateGain.setTargetValue (inStep < 0.5 ? 1.0f : 1.0f - s.gateDepth);
                const auto g = gateGain.getNextValue();
                const auto noise = noiseFilter.processSample (0, random.nextFloat() * 2.0f - 1.0f) * s.noiseGain;

                for (int ch = 0; ch < channels; ++ch)
                {
                    const auto dry = buffer.getSample (ch, i);
                    auto x = dry + (highpass.processSample (ch, dry) - dry) * s.highpassMix;
                    if (s.pitchMix > 0.0f)
                        x += pitch[(size_t) ch].process (x, ratio) * s.pitchMix;
                    else
                        pitch[(size_t) ch].process (x, 1.0f);   // 지연선은 계속 채워 둔다
                    x = (x + noise) * g;

                    const auto delayed = echo.popSample (ch);
                    echo.pushSample (ch, x + delayed * s.echoFeedback);
                    reverbBuffer.setSample (ch, i, x);
                    buffer.setSample (ch, i, (x + delayed * s.echoWet) * s.outputGain);
                }
            }

            // 리버브는 서브블록마다 처리해야 그 사이 바뀐 wet 값을 반영할 수 있다
            juce::dsp::AudioBlock<float> block (reverbBuffer);
            auto sub = block.getSubsetChannelBlock (0, (size_t) channels).getSubBlock ((size_t) start, (size_t) n);
            reverb.process (juce::dsp::ProcessContextReplacing<float> (sub));
            for (int ch = 0; ch < channels; ++ch)
                buffer.addFrom (ch, start, reverbBuffer, ch, start, n, s.reverbWet * s.outputGain);
        }

        freeBeats = startBeats + samples * beatsPerSample;
    }

private:
    double sampleRate = 44100.0;
    juce::dsp::StateVariableTPTFilter<float> highpass, noiseFilter;
    std::array<PitchShifter, maxChannels> pitch;
    juce::dsp::DelayLine<float, juce::dsp::DelayLineInterpolationTypes::Linear> echo { 192000 };
    juce::dsp::Reverb reverb;
    juce::AudioBuffer<float> reverbBuffer;
    juce::SmoothedValue<float> amount { 0.0f }, gateGain { 1.0f };
    juce::Random random { 1234 };
    double freeBeats = 0.0;
};

} // namespace skyrise
