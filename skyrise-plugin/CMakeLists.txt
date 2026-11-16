cmake_minimum_required(VERSION 3.22)

project(Skyrise VERSION 0.1.0)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# JUCE: -DJUCE_DIR=경로로 받아 둔 JUCE를 쓰고, 없으면 GitHub에서 받는다
set(JUCE_DIR "" CACHE PATH "Local JUCE checkout (optional)")
if(JUCE_DIR)
    add_subdirectory(${JUCE_DIR} ${CMAKE_BINARY_DIR}/JUCE)
else()
    include(FetchContent)
    FetchContent_Declare(JUCE
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG 8.0.4
        GIT_SHALLOW ON)
    FetchContent_MakeAvailable(JUCE)
endif()

# 맥은 VST3 + AU, 그 밖에서는 VST3 + 단독 실행 앱(테스트용)
if(APPLE)
    set(SKYRISE_FORMATS VST3 AU)
else()
    set(SKYRISE_FORMATS VST3 Standalone)
endif()

juce_add_plugin(Skyrise
    COMPANY_NAME "Star Swarm"
    COMPANY_WEBSITE "https://github.com/ckno960/star-swarm"
    BUNDLE_ID com.starswarm.skyrise
    PLUGIN_MANUFACTURER_CODE Stsw
    PLUGIN_CODE Skyr
    FORMATS ${SKYRISE_FORMATS}
    PRODUCT_NAME "Skyrise"
    IS_SYNTH FALSE
    NEEDS_MIDI_INPUT FALSE
    NEEDS_MIDI_OUTPUT FALSE
    IS_MIDI_EFFECT FALSE
    EDITOR_WANTS_KEYBOARD_FOCUS FALSE
    AU_MAIN_TYPE kAudioUnitType_Effect
    VST3_CATEGORIES Fx
    COPY_PLUGIN_AFTER_BUILD FALSE)

target_sources(Skyrise PRIVATE
    Source/PluginProcessor.cpp
    Source/PluginEditor.cpp)

target_compile_definitions(Skyrise PUBLIC
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_VST3_CAN_REPLACE_VST2=0
    JUCE_DISPLAY_SPLASH_SCREEN=0)

target_link_libraries(Skyrise
    PRIVATE juce::juce_audio_utils juce::juce_dsp
    PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags juce::juce_recommended_warning_flags)

# 소리 처리 테스트: DAW 없이 엔진만 돌려 본다
juce_add_console_app(SkyriseTests PRODUCT_NAME "SkyriseTests")
target_sources(SkyriseTests PRIVATE Tests/EngineTests.cpp)
target_compile_definitions(SkyriseTests PRIVATE JUCE_USE_CURL=0 JUCE_WEB_BROWSER=0)
target_include_directories(SkyriseTests PRIVATE Source)
target_link_libraries(SkyriseTests
    PRIVATE juce::juce_dsp
    PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_warning_flags)
