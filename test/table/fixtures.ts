/*
 * Clipboard HTML in the shapes spreadsheets and editors produce. These are representative
 * reconstructions of the markup each app writes (namespaces, conditional comments, mso
 * styles, wrapper elements, `<br>` line breaks), not byte-for-byte captures.
 */

/** Excel desktop: full document, mso styles, Start/EndFragment comments, same-cell line breaks. */
export const EXCEL_HTML = `<html xmlns:v="urn:schemas-microsoft-com:vml"
xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:x="urn:schemas-microsoft-com:office:excel"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta http-equiv=Content-Type content="text/html; charset=utf-8">
<meta name=ProgId content=Excel.Sheet>
<style>
<!--table {mso-displayed-decimal-separator:"\\.";}
.xl65 {mso-number-format:"\\@";}
-->
</style>
</head>
<body link="#0563C1" vlink="#954F72">
<table border=0 cellpadding=0 cellspacing=0 width=256 style='border-collapse:collapse;width:192pt'>
<!--StartFragment-->
 <col width=64 span=4 style='width:48pt'>
 <tr height=20 style='height:15.0pt'>
  <td height=20 width=64 style='height:15.0pt;width:48pt'>Code</td>
  <td width=64 style='width:48pt'>Qty</td>
  <td width=64 style='width:48pt'>Note</td>
  <td width=64 style='width:48pt'>Region</td>
 </tr>
 <tr height=40 style='height:30.0pt'>
  <td height=40 class=xl65 style='height:30.0pt'>00123</td>
  <td align=right>5</td>
  <td class=xl66 width=64 style='width:48pt'>line one<br style='mso-data-placement:same-cell' />line two</td>
  <td rowspan=2>North</td>
 </tr>
 <tr height=20 style='height:15.0pt'>
  <td height=20 colspan=2 style='height:15.0pt'>Merged A–B</td>
  <td>Tom &amp; Jerry</td>
 </tr>
<!--EndFragment-->
</table>
</body>
</html>`;

/** Google Sheets: meta + google-sheets-html-origin wrapper, inline styles, data-sheets-value. */
export const SHEETS_HTML =
  `<meta charset='utf-8'><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}br {mso-data-placement:same-cell;}--></style>` +
  `<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" style="table-layout:fixed;font-size:10pt;font-family:Arial;width:0px;border-collapse:collapse;border:none">` +
  `<colgroup><col width="100"/><col width="100"/></colgroup><tbody>` +
  `<tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;">Name</td>` +
  `<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;">Seats</td></tr>` +
  `<tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;" data-sheets-value="{&quot;1&quot;:2,&quot;2&quot;:&quot;Ada&quot;}">Ada</td>` +
  `<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;text-align:right;" data-sheets-value="{&quot;1&quot;:3,&quot;3&quot;:42}">42</td></tr>` +
  `<tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;">Grace<br>Hopper</td>` +
  `<td style="overflow:hidden;padding:2px 3px 2px 3px;vertical-align:bottom;text-align:right;">7</td></tr>` +
  `</tbody></table>`;

/** Word: MsoTableGrid with paragraphs and o:p elements inside cells. */
export const WORD_HTML = `<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse;border:none'>
 <tr>
  <td width=301 valign=top style='width:225.4pt'><p class=MsoNormal>Item<o:p></o:p></p></td>
  <td width=301 valign=top style='width:225.4pt'><p class=MsoNormal>Detail<o:p></o:p></p></td>
 </tr>
 <tr>
  <td width=301 valign=top style='width:225.4pt'><p class=MsoNormal>Plan<o:p></o:p></p></td>
  <td width=301 valign=top style='width:225.4pt'><p class=MsoNormal>First paragraph<o:p></o:p></p><p class=MsoNormal>Second paragraph<o:p></o:p></p></td>
 </tr>
</table>`;

/** A web page table with a real header. */
export const WEB_HTML = `<div class="card"><h2>Team</h2>
<table class="data">
  <thead><tr><th scope="col">Name</th><th scope="col">Role</th></tr></thead>
  <tbody>
    <tr><td><a href="/ada">Ada</a> <span class="badge">Admin</span></td><td>Engineer</td></tr>
    <tr><td>Grace</td><td>  Rear&nbsp;&nbsp;Admiral  </td></tr>
  </tbody>
</table></div>`;

/** What Excel puts in text/plain for the same ranges: quoted multi-line cells, trailing CRLF. */
export const EXCEL_TSV = 'Code\tQty\tNote\r\n00123\t5\t"line one\nline two"\r\nMerged A–B\t\tTom & Jerry\r\n';
