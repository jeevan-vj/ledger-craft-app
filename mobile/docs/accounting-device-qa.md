# Accounting native-device verification

Actual execution environment: Linux x86_64. `adb`, Android emulator,
`sdkmanager`, `xcodebuild` and `xcrun` are absent. There is no Android SDK
or `/dev/kvm`. Java is installed. **No signed native-device check passed in
this environment.** Expo web, Jest and bundle exports are separate evidence.

Use an authorized test device with the signed app connected to an isolated
verification backend, never a real company or IRD account. Run the same manual
case on iOS and Android. Do not send real invoices or file a return.

| Native action | Expected result |
| --- | --- |
| Sign up, enter phone, set up NZ GST company, background/reopen | Phone/company survive; password is not retained in an onboarding draft |
| Create net1,000/GST150 invoice, receive1,150; second net400/GST60 receive230 | Paid first invoice, second balance230; receipts total1,380 |
| Approve gross230/rawGST30 and exempt50 expenses | Gross saved230; operating costs250, GSTinput30; pending expense excluded |
| Receive gross345/GST45 supplier bill, pay69 | AP276; expense300; inputGST45 |
| Reports before opening capital | Profit850; cash1,031; AR230; AP276; balanced ledger |
| Prepare invoice-basis GST | Output210/input75/payable135; grosssales1,610/purchases625 |
| Switch GST payments basis | Output180/input39/payable141; previous invoice figures cleared |
| Review sourced GST adjustments output−15/input+3 | Output195/input78/payable117 on invoice basis; draft reload retains basis/reasons/references/reviewer |
| Company worksheet: profit850 + addback100 − deduction50 − losses200 | Taxable700; confirmed28% tax196; credits50; payable146; draft reload retains worksheet |
| Opening capital: cashdebit5,000/equitycredit5,000; retry same reference | Cash6,031/equity increases5,000; profit850/GST135 unchanged; one journal |
| Match imported69 withdrawal to existing supplier69 payment | Original supplier payment retained; no extra payment/GST/cost; AP276/cash6,031/profit850 after duplicate import correction |
| USD100 invoice booked at1.60, reviewed settlement1.65 | AR160 clears; cash165; exchange gain5, payment amount remainsUSD100 |
| USD100 bill booked at1.60, reviewed settlement1.65 | AP160 clears; cash165 out; exchange loss5 |
| Ledger audit: review original receipt and apply GST30→15 legacy proposal | Expense increases15, inputGST decreases15, cash unchanged; retry no second correction; immutable source unchanged |
| Offline/retry, keyboard open, large text, safe areas, back gestures | Clear error and safe retry; no duplicate payment; inputs and final action remain reachable |

On Android, navigate to a result then run from `mobile/`:

```sh
./scripts/verify-device-accounting.sh 'Net GST payable: $141.00' /tmp/mobile-native/payments-gst
```

This captures the actual native screenshot and accessibility tree and asserts
that exact result. It does not automate entry of the worksheet or validate
backend totals by itself. Retain backend report JSON and source journal counts
alongside each device capture. On iOS use the signed simulator/device and
Xcode accessibility/screenshot tools; this Linux script cannot verify iOS.
