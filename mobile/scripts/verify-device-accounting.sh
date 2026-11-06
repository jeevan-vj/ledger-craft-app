#!/usr/bin/env bash
set -euo pipefail
# Capture evidence only from an already installed, signed app on an authorized Android device.
# Usage: ./scripts/verify-device-accounting.sh 'Net GST payable: $141.00' /tmp/mobile-native/payments-gst
expected_text=${1:?Pass the exact expected visible accounting result}
evidence_prefix=${2:?Pass a local evidence output prefix}
if ! command -v adb >/dev/null 2>&1; then
  echo 'BLOCKED: adb is unavailable; no Android device verification was performed.' >&2
  exit 2
fi
if ! adb get-state >/dev/null 2>&1; then
  echo 'BLOCKED: connect and authorize one Android test device or emulator.' >&2
  exit 2
fi
if ! adb shell pm path com.easybizinvoice.app | rg -q '^package:'; then
  echo 'BLOCKED: signed com.easybizinvoice.app is not installed.' >&2
  exit 2
fi
mkdir -p "$(dirname "$evidence_prefix")"
adb shell uiautomator dump /sdcard/ledgercraft-accounting-verification.xml >/dev/null
adb pull /sdcard/ledgercraft-accounting-verification.xml "${evidence_prefix}.xml" >/dev/null
adb exec-out screencap -p > "${evidence_prefix}.png"
python3 - "$expected_text" "${evidence_prefix}.xml" <<'PY'
import sys,xml.etree.ElementTree as ET
expected,path=sys.argv[1:]
root=ET.parse(path).getroot()
visible='\n'.join(node.attrib.get(key,'') for node in root.iter() for key in ('text','content-desc'))
if expected not in visible:
    raise SystemExit('FAIL: expected result not found in the native accessibility tree: '+expected)
print('PASS: native Android accessibility tree contains expected result: '+expected)
PY
