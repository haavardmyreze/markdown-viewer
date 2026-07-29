import { read, utils } from 'xlsx'

/**
 * Converts the first sheet of a workbook to CSV so it can flow straight
 * into the existing CSV reader. Multi-sheet workbooks only show sheet one —
 * there's no sheet switcher yet.
 */
export function excelToCsv(data: ArrayBuffer): string {
  const workbook = read(data, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    return ''
  }

  const sheet = workbook.Sheets[sheetName]
  return utils.sheet_to_csv(sheet)
}
