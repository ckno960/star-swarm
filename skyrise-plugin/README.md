# Skyrise (빌드업 플러그인)

슬라이더 하나(**RISE**, 0~100%)를 올리면 빌드업 효과가 한꺼번에 쌓이는 오디오 이펙트 플러그인입니다. 맥용 **VST3**와 **AU**(인텔·애플 실리콘 겸용)로 빌드합니다. 빌드업 동안 RISE를 0% → 100%로 오토메이션하고, 드롭 순간 0%로 떨어뜨리면 원음으로 돌아갑니다.

"슬라이더 하나로 빌드업" 방식만 따왔고, 이름·화면·소리 설정은 새로 만들었습니다.

## RISE에 따라 쌓이는 효과

| 효과 | 0% | 100% | 시작 |
|---|---|---|---|
| 하이패스 필터 | 꺼짐(원음 그대로) | 2 kHz | 0%부터, 지수 곡선 |
| 리버브 | 0 | wet 50%, 큰 방 | 10% |
| 에코 (점8분음표, 곡 템포) | 0 | wet 35%, 피드백 60% | 15% |
| 화이트 노이즈 라이저 | 0 | 밴드패스 500 Hz → 8 kHz | 20% |
| 게이트 (곡 템포) | 0 | 깊이 100%, 1/8 → 1/16 → 1/32 | 30% |
| 피치 상승 레이어 | 0 | +12반음, 50% 섞음 | 45% |
| 출력 볼륨 | 100% | 55% (효과가 쌓여 커지는 만큼 줄임) | |

- 게이트와 에코는 DAW의 템포와 재생 위치에 맞춥니다. 재생 중이 아니면 128 BPM 내부 시계를 씁니다.
- RISE 변화는 50 ms에 걸쳐 부드럽게 따라가서, 드롭 순간에도 '틱' 소리가 나지 않습니다.
- 세기 곡선은 `Source/BuildupEngine.h`의 `settingsFor()` 한 곳에 모여 있습니다. 소리를 바꾸려면 여기 숫자를 고칩니다.

## 맥에 설치

최신 빌드: **https://github.com/ckno960/star-swarm/releases/download/skyrise-latest/Skyrise-mac.zip** (로그인 없이 받을 수 있음. `skyrise-plugin/`을 고칠 때마다 새 빌드로 바뀝니다)

압축을 풀면 나오는 `INSTALL-mac.txt` 순서대로 설치합니다. 요약:

1. `Skyrise.vst3` → `~/Library/Audio/Plug-Ins/VST3/`, `Skyrise.component` → `~/Library/Audio/Plug-Ins/Components/`
2. 터미널에서 `xattr -dr com.apple.quarantine <복사한 파일>` (인터넷에서 받은 파일의 실행 막힘 풀기)
3. DAW에서 플러그인 다시 검색 (REAPER: Settings → Plug-ins → VST/AU → Re-scan)

애플 개발자 계정으로 정식 서명(공증)한 것이 아니라 임시 서명만 했기 때문에 2번이 필요합니다.

## 빌드

```
cmake -S skyrise-plugin -B build -DCMAKE_BUILD_TYPE=Release   # JUCE 8.0.4를 GitHub에서 받음 (-DJUCE_DIR=로 받아 둔 JUCE 지정 가능)
cmake --build build --target Skyrise_VST3 SkyriseTests
./build/SkyriseTests_artefacts/Release/SkyriseTests             # 소리 처리 테스트
```

맥에서는 AU(`Skyrise_AU`)도, 그 밖의 운영체제에서는 테스트용 단독 실행 앱(`Skyrise_Standalone`)도 만듭니다. 리눅스에서는 `libfreetype6-dev libx11-dev libxrandr-dev libxinerama-dev libxcursor-dev libxext-dev libasound2-dev`가 필요합니다.

`.github/workflows/skyrise.yml`이 `skyrise-plugin/`을 고칠 때마다 맥 빌드 → 테스트 → 임시 서명 → AU 검사(auval) → zip → 릴리스(`skyrise-latest`) 교체를 자동으로 합니다.

## 테스트 (`Tests/EngineTests.cpp`)

DAW 없이 엔진에 신호를 넣어 확인합니다: RISE가 오를수록 모든 효과가 세지는지, 0%에서 원음과 같은지(차이 0.1% 미만), 100%에서 저음이 줄어드는지, 게이트가 템포에 맞춰 끊는지, 피치가 한 옥타브 오르는지, 100%에서 20초 동안 시끄러운 노이즈를 넣어도 터지지 않는지(피크 2 미만), 드롭 0.1초 뒤 원음으로 돌아오는지.

## 구조

```
Source/BuildupEngine.h    → 소리 처리 전부 (효과 세기 곡선, 피치 시프터, 필터·게이트·노이즈·에코·리버브)
Source/PluginProcessor.*  → DAW와 연결 (RISE 파라미터, 템포·재생 위치, 상태 저장)
Source/PluginEditor.*     → 화면 (큰 세로 슬라이더, 켜진 효과 표시, 세기에 따라 바뀌는 배경)
Tests/EngineTests.cpp     → 엔진 테스트
INSTALL-mac.txt           → zip에 들어가는 설치 안내
```

JUCE는 [JUCE 8 라이선스](https://juce.com/legal/juce-8-licence/)를 따릅니다(개인·소규모는 무료 Starter 조건).
