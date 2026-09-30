#!/usr/bin/env bash

export JAVA_HOME="${JAVA_HOME:-$HOME/.local/android/jdk-21.0.10+7}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$HOME/Android/Sdk}}"
export ANDROID_HOME="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
export PATH="$JAVA_HOME/bin:$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$ANDROID_SDK_ROOT/platform-tools:$PATH"

unset HTTP_PROXY HTTPS_PROXY NO_PROXY http_proxy https_proxy no_proxy
