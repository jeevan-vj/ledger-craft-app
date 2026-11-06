# GST due-date calendar sources

The issue acceptance criteria name IRD's standard 28th, 15 January (November-end)
and 7 May (March-end) due dates. Weekend and national-public-holiday adjustments
use the published recurring NZ rules and Matariki dates from:

- https://raw.githubusercontent.com/commenthol/date-holidays/master/data/countries/NZ.yaml
- Downloaded source SHA256: `2ff9848b11c3d85c221450cf2779c4fc7ab4372e8f1e8569b9c95fe5e7e310d4`
- Source attribution: https://www.govt.nz/browse/work/public-holidays-and-work/public-holidays-and-anniversary-dates/
- Published Matariki calendar cited there: https://www.mbie.govt.nz/assets/matariki-dates-2022-to-2052-matariki-advisory-group.pdf
- IRD guidance linked by issue #84: https://www.ird.govt.nz/gst/filing-and-paying-gst-and-refunds

The rules/dates were read from the published source during this run, not
invented from memory. No new runtime dependency or network request is required.
This is a national calendar: provincial anniversaries and IRD extensions cannot
be inferred from saved settings and must be confirmed in myIR. Matariki dates
are published only through2052; later due dates are explicitly flagged for
confirmation. This is software date-rule verification, not legal certification
or proof that the company's selected IRD periods match its registration.
