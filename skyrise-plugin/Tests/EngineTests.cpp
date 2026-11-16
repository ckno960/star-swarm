// 빌드업 엔진 테스트: DAW 없이 신호를 넣어 각 효과가 의도대로 움직이는지 확인한다
#include <juce_dsp/juce_dsp.h>
#include "BuildupEngine.h"

namespace
{
constexpr double sr = 44100.0;
constexpr int block = 512;
int failures = 0;

void check (bool ok, const juce::String& what)
{
    std::cout << (ok ? "  ok   " : "  FAIL ") << what << "\n";
    if (! ok) ++failures;
}

double rms (const std::vector<float>& x, size_t from, size_t to)
{
    double sum = 0.0;
    for (auto i = from; i < to; ++i) sum += (double) x[i] * x[i];
    return std::sqrt (sum / (double) (to - from));
}

// 엔진에 신호를 블록 단위로 흘려 보내고 왼쪽 채널 출력을 돌려준다
std::vector<float> run (skyrise::BuildupEngine& e, const std::function<float (int)>& input, int samples, double bpm = 128.0, double ppq = 0.0)
{
    std::vector<float> out;
    juce::AudioBuffer<float> buf (2, block);
    for (int start = 0; start < samples; start += block)
    {
        const auto n = juce::jmin (block, samples - start);
        buf.setSize (2, n, false, false, true);
        for (int i = 0; i < n; ++i)
            for (int ch = 0; ch < 2; ++ch) buf.setSample (ch, i, input (start + i));
        e.process (buf, bpm, ppq < 0.0 ? -1.0 : ppq + start * bpm / 60.0 / sr);
        for (int i = 0; i < n; ++i) out.push_back (buf.getSample (0, i));
    }
    return out;
}

std::function<float (int)> sine (double hz, float level = 0.5f)
{
    return [=] (int i) { return level * (float) std::sin (juce::MathConstants<double>::twoPi * hz * i / sr); };
}

std::unique_ptr<skyrise::BuildupEngine> makeEngine (float amount)
{
    auto e = std::make_unique<skyrise::BuildupEngine>();
    e->prepare (sr, block);
    e->setAmount (amount);
    e->reset();   // 시작부터 그 세기로
    return e;
}
} // namespace

int main()
{
    std::cout << "settings\n";
    {
        auto prev = skyrise::settingsFor (0.0f);
        bool rising = true;
        for (int i = 1; i <= 100; ++i)
        {
            const auto s = skyrise::settingsFor (i / 100.0f);
            rising = rising && s.highpassHz >= prev.highpassHz && s.reverbWet >= prev.reverbWet
                     && s.pitchSemis >= prev.pitchSemis && s.gateDepth >= prev.gateDepth && s.gateBeats <= prev.gateBeats;
            prev = s;
        }
        check (rising, "every effect grows (or the gate gets faster) as RISE goes up");
        const auto zero = skyrise::settingsFor (0.0f);
        check (zero.reverbWet <= 0.0f && zero.echoWet <= 0.0f && zero.noiseGain <= 0.0f && zero.gateDepth <= 0.0f && zero.pitchMix <= 0.0f,
               "at 0% every wet effect is off");
        const auto full = skyrise::settingsFor (1.0f);
        check (std::abs (full.highpassHz - 2000.0f) < 1.0f && std::abs (full.pitchSemis - 12.0f) < 0.01f && full.gateBeats < 0.2,
               "at 100%: highpass 2 kHz, pitch +12, gate 1/32");
    }

    std::cout << "0% is nearly transparent\n";
    {
        auto e = makeEngine (0.0f);
        const auto in = sine (440.0);
        const auto out = run (*e, in, (int) sr);
        double diff = 0.0, ref = 0.0;
        for (int i = (int) sr / 2; i < (int) sr; ++i)
        {
            diff += std::pow (out[(size_t) i] - in (i), 2);
            ref += std::pow (in (i), 2);
        }
        check (std::sqrt (diff / ref) < 0.001, "440 Hz sine passes with < 0.1% difference (" + juce::String (std::sqrt (diff / ref), 4) + ")");
    }

    std::cout << "highpass removes the low end at 100%\n";
    {
        auto lowOnly = [] (float amount)
        {
            auto e = makeEngine (amount);
            const auto out = run (*e, sine (80.0), (int) sr);
            return rms (out, (size_t) sr / 2, (size_t) sr);
        };
        const auto at0 = lowOnly (0.0f);
        // 100%에서는 노이즈·리버브도 섞이므로 '줄어든 정도'만 본다
        const auto at100 = lowOnly (1.0f);
        check (at100 < at0 * 0.5, "80 Hz sine is much quieter (" + juce::String (at0, 3) + " -> " + juce::String (at100, 3) + ")");
    }

    std::cout << "gate chops the sound in tempo\n";
    {
        auto e = makeEngine (0.6f);   // 1/16, 깊이 약 0.84
        const auto out = run (*e, sine (3000.0), (int) sr * 2, 120.0, 0.0);
        // 120 BPM의 16분음표 = 0.125초. 켜진 반칸과 꺼진 반칸의 크기를 비교
        const auto step = (size_t) (sr * 0.125);
        double onSum = 0, offSum = 0;
        for (int k = 4; k < 12; ++k)
        {
            const auto s0 = (size_t) k * step;
            onSum += rms (out, s0 + step / 10, s0 + step * 4 / 10);
            offSum += rms (out, s0 + step * 6 / 10, s0 + step * 9 / 10);
        }
        check (offSum < onSum * 0.6, "off halves are quieter than on halves (" + juce::String (offSum / onSum, 3) + ")");
    }

    std::cout << "pitch shifter raises the pitch\n";
    {
        skyrise::PitchShifter p;
        p.prepare (sr);
        std::vector<float> out;
        for (int i = 0; i < (int) sr; ++i) out.push_back (p.process (sine (220.0) (i), 2.0f));
        // 0을 위로 지나는 횟수로 주파수를 잰다 (겹침 구간에서 조금 흔들리므로 넉넉히)
        int crossings = 0;
        for (size_t i = (size_t) sr / 2; i + 1 < out.size(); ++i)
            if (out[i] <= 0 && out[i + 1] > 0) ++crossings;
        const auto hz = crossings * 2.0;
        check (hz > 400.0 && hz < 480.0, "220 Hz shifted by +12 reads about 440 Hz (" + juce::String (hz) + ")");
    }

    std::cout << "stays stable at 100% for 20 seconds of loud noise\n";
    {
        auto e = makeEngine (1.0f);
        juce::Random r (7);
        const auto out = run (*e, [&] (int) { return r.nextFloat() * 1.8f - 0.9f; }, (int) sr * 20);
        float peak = 0.0f;
        bool finite = true;
        for (auto x : out) { peak = juce::jmax (peak, std::abs (x)); finite = finite && std::isfinite (x); }
        check (finite && peak < 2.0f, "no NaN and peak stays below 2 (" + juce::String (peak, 2) + ")");
    }

    std::cout << "the drop: going from 100% to 0% cuts the effects quickly\n";
    {
        auto e = makeEngine (1.0f);
        const auto in = sine (440.0);
        run (*e, in, (int) sr * 2);
        e->setAmount (0.0f);
        // 이어서 0.5초 더: 앞 0.1초(스무딩) 뒤로는 원음에 가까워야 한다
        std::vector<float> out;
        juce::AudioBuffer<float> buf (2, block);
        for (int start = 0; start < (int) sr / 2; start += block)
        {
            for (int i = 0; i < block; ++i)
                for (int ch = 0; ch < 2; ++ch) buf.setSample (ch, i, in ((int) sr * 2 + start + i));
            e->process (buf, 128.0, -1.0);
            for (int i = 0; i < block; ++i) out.push_back (buf.getSample (0, i));
        }
        double diff = 0.0, ref = 0.0;
        for (int i = (int) (sr * 0.1); i < (int) out.size(); ++i)
        {
            diff += std::pow (out[(size_t) i] - in ((int) sr * 2 + i), 2);
            ref += std::pow (in ((int) sr * 2 + i), 2);
        }
        check (std::sqrt (diff / ref) < 0.1, "100 ms after the drop the sound is dry again (" + juce::String (std::sqrt (diff / ref), 4) + ")");
    }

    std::cout << (failures == 0 ? "\nall passed\n" : "\nFAILED: " + juce::String (failures).toStdString() + "\n");
    return failures == 0 ? 0 : 1;
}
