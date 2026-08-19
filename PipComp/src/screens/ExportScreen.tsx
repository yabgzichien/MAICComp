import * as Clipboard from 'expo-clipboard';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../components/Icon';
import { Amount, Card, Eyebrow, IconButton, TopBar } from '../components/ui';
import {
  buildFinancialReportBundle,
  buildReportPeriod,
  type ReportPeriodType,
} from '../lib/bookkeeping';
import {
  generateAdvancedImportJSON,
  generateCSV,
  generateExcelWorkbook,
  generateHTMLReport,
  generatePrintablePDFHtml,
  saveOrDownloadExport,
  type ExportFormat,
} from '../lib/financialExport';
import { notify } from '../lib/platformAlert';
import { useAccent } from '../state/accent';
import { useThemeColors } from '../state/colorScheme';
import { useAppData } from '../state/store';
import { colors, numFont, platformShadow, radius, uiFont } from '../theme';

interface FormatOption {
  id: ExportFormat;
  title: string;
  sub: string;
  badge: string;
  icon: IconName;
  fileExt: string;
  mimeType: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: 'pdf',
    title: 'PDF Financial Statement',
    sub: 'Traditional 2-column Balance Sheet, Income Statement & itemized ledger.',
    badge: 'Formal P&L',
    icon: 'receipt',
    fileExt: 'pdf.html',
    mimeType: 'text/html',
  },
  {
    id: 'xlsx',
    title: 'Excel Workbook (.xlsx)',
    sub: '4 Sheets: Income Statement, Balance Sheet, Ledger, and Monthly Trends.',
    badge: '4 Sheets',
    icon: 'table',
    fileExt: 'xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  },
  {
    id: 'html',
    title: 'Interactive HTML Analytics',
    sub: 'Visual report with SVG cash flow, category donut, and net worth charts.',
    badge: 'With Charts',
    icon: 'trending',
    fileExt: 'html',
    mimeType: 'text/html',
  },
  {
    id: 'csv',
    title: 'CSV Data Sheet',
    sub: 'Universal structured tabular accounting export for any spreadsheet.',
    badge: 'Universal',
    icon: 'file',
    fileExt: 'csv',
    mimeType: 'text/csv',
  },
  {
    id: 'json',
    title: 'Advanced Import JSON',
    sub: 'Same schema Advanced Import reads — copy or download, then re-import anytime.',
    badge: 'Re-importable',
    icon: 'code',
    fileExt: 'json',
    mimeType: 'application/json',
  },
];

const PERIOD_TABS: { type: ReportPeriodType; label: string }[] = [
  { type: 'monthly', label: 'Monthly' },
  { type: 'yearly', label: 'Yearly' },
  { type: 'all-time', label: 'All Time' },
  { type: 'custom', label: 'Custom' },
];

export function ExportScreen({
  onBack,
  initialMonth,
}: {
  onBack: () => void;
  initialMonth?: string;
}) {
  const insets = useSafeAreaInsets();
  const theme = useAccent();
  const themeColors = useThemeColors();
  const { transactions, categories, accounts, balanceEntries, kyc, commitments, commitmentOccurrences } = useAppData();
  const commitmentExtra = useMemo(
    () => ({ commitments, occurrences: commitmentOccurrences }),
    [commitments, commitmentOccurrences]
  );

  const now = useMemo(() => new Date(), []);
  const curY = now.getFullYear();
  const curM = String(now.getMonth() + 1).padStart(2, '0');
  const defaultMonth = initialMonth || `${curY}-${curM}`;

  const [periodType, setPeriodType] = useState<ReportPeriodType>(initialMonth ? 'monthly' : 'all-time');
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);
  const [selectedYear, setSelectedYear] = useState<number>(curY);
  const [customStart, setCustomStart] = useState<string>(`${curY}-01-01`);
  const [customEnd, setCustomEnd] = useState<string>(now.toISOString().slice(0, 10));
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf');
  const [exporting, setExporting] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [previewTitle, setPreviewTitle] = useState<string>('');

  // Extract all distinct months present in transactions
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    months.add(`${curY}-${curM}`);
    for (const t of transactions) {
      if (t.date && t.date.length >= 7) months.add(t.date.slice(0, 7));
    }
    return [...months].sort().reverse();
  }, [transactions, curY, curM]);

  // Extract distinct years present in transactions
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    years.add(curY);
    for (const t of transactions) {
      if (t.date && t.date.length >= 4) {
        const y = parseInt(t.date.slice(0, 4), 10);
        if (!isNaN(y)) years.add(y);
      }
    }
    return [...years].sort().reverse();
  }, [transactions, curY]);

  // Active Report Period & calculated report bundle
  const activePeriod = useMemo(() => {
    return buildReportPeriod(periodType, selectedMonth, selectedYear, customStart, customEnd, now);
  }, [periodType, selectedMonth, selectedYear, customStart, customEnd, now]);

  const verifiedName = useMemo(() => {
    return kyc && kyc.status === 'verified' && kyc.fullName && kyc.fullName.trim()
      ? kyc.fullName.trim()
      : 'Pip User';
  }, [kyc]);

  const reportData = useMemo(() => {
    return buildFinancialReportBundle(
      transactions,
      categories,
      accounts,
      balanceEntries,
      activePeriod,
      verifiedName
    );
  }, [transactions, categories, accounts, balanceEntries, activePeriod, verifiedName]);

  // Trigger export generation and download
  const handleExport = async () => {
    setExporting(true);
    try {
      const sanitizedName = verifiedName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const periodSlug = activePeriod.label.replace(/[^a-zA-Z0-9_-]/g, '_');
      const baseFileName = `${sanitizedName}_${periodSlug}`;

      let content: string | Uint8Array;
      let ext: string = selectedFormat;
      let mime = 'text/plain';

      if (selectedFormat === 'xlsx') {
        content = generateExcelWorkbook(reportData);
        ext = 'xlsx';
        mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else if (selectedFormat === 'csv') {
        content = generateCSV(reportData);
        ext = 'csv';
        mime = 'text/csv';
      } else if (selectedFormat === 'html') {
        content = generateHTMLReport(reportData);
        ext = 'html';
        mime = 'text/html';
      } else if (selectedFormat === 'json') {
        content = generateAdvancedImportJSON(reportData, commitmentExtra);
        ext = 'json';
        mime = 'application/json';
      } else {
        // PDF Printable HTML
        content = generatePrintablePDFHtml(reportData);
        ext = 'pdf.html';
        mime = 'text/html';
      }

      const fileName = `${baseFileName}.${ext}`;
      const res = await saveOrDownloadExport(fileName, content, mime);

      if (res.success) {
        if (selectedFormat === 'pdf' && Platform.OS === 'web') {
          // On Web, open print window directly for PDF format
          const win = window.open('', '_blank');
          if (win) {
            win.document.write(content as string);
            win.document.close();
            win.focus();
            setTimeout(() => win.print(), 350);
          }
        } else {
          notify('Export Successful', `Financial file ${fileName} has been generated and saved.`);
        }
      } else {
        notify('Export Error', res.error || 'Unable to save export file.');
      }
    } catch (err: any) {
      notify('Export Failed', err?.message || 'An unexpected error occurred during export.');
    } finally {
      setExporting(false);
    }
  };

  // Open in-app document preview
  const handlePreview = () => {
    if (selectedFormat === 'xlsx' || selectedFormat === 'csv') {
      const csvText = generateCSV(reportData);
      setPreviewContent(csvText);
      setPreviewTitle(`${selectedFormat.toUpperCase()} Preview (${activePeriod.label})`);
      setPreviewVisible(true);
    } else if (selectedFormat === 'html') {
      const htmlText = generateHTMLReport(reportData);
      setPreviewContent(htmlText);
      setPreviewTitle(`HTML Report Preview (${activePeriod.label})`);
      setPreviewVisible(true);
    } else if (selectedFormat === 'json') {
      const jsonText = generateAdvancedImportJSON(reportData, commitmentExtra);
      setPreviewContent(jsonText);
      setPreviewTitle(`Advanced Import JSON Preview (${activePeriod.label})`);
      setPreviewVisible(true);
    } else {
      // PDF
      const pdfHtml = generatePrintablePDFHtml(reportData);
      setPreviewContent(pdfHtml);
      setPreviewTitle(`PDF Statement Preview (${activePeriod.label})`);
      setPreviewVisible(true);
    }
  };

  // Copy the Advanced Import JSON straight to the clipboard.
  const [copyingJson, setCopyingJson] = useState(false);
  const handleCopyJSON = async () => {
    setCopyingJson(true);
    try {
      const json = generateAdvancedImportJSON(reportData, commitmentExtra);
      await Clipboard.setStringAsync(json);
      notify('Copied', 'Advanced Import JSON copied to clipboard. Paste it into Advanced Import to re-import.');
    } catch (err: any) {
      notify('Copy Failed', err?.message || 'Unable to copy JSON to clipboard.');
    } finally {
      setCopyingJson(false);
    }
  };

  const isIncome = reportData.incomeStatement.totalIncome;
  const isExpense = reportData.incomeStatement.totalExpense;
  const isNet = reportData.incomeStatement.netIncome;

  return (
    <View style={[styles.root, { backgroundColor: themeColors.bg }]}>
      <View style={{ paddingTop: insets.top + 4 }}>
        <TopBar title="Financial Reports & Export" onBack={onBack} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 48 }}>
        {/* TIMEFRAME SELECTOR */}
        <Eyebrow style={{ marginBottom: 10 }}>1. Reporting Period</Eyebrow>
        <View style={[styles.periodTabs, { backgroundColor: themeColors.surface2, borderColor: themeColors.line2 }]}>
          {PERIOD_TABS.map((tab) => {
            const active = periodType === tab.type;
            return (
              <Pressable
                key={tab.type}
                onPress={() => setPeriodType(tab.type)}
                style={[styles.periodTabBtn, active && { backgroundColor: theme.accentInk }]}
              >
                <Text
                  style={[
                    styles.periodTabText,
                    { color: themeColors.ink2 },
                    active && styles.periodTabTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* MONTH PICKER */}
        {periodType === 'monthly' && (
          <Card style={{ padding: 14, marginTop: 10 }}>
            <Text style={[styles.subHeader, { color: themeColors.ink }]}>Select Month</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {availableMonths.map((m) => {
                  const [y, mm] = m.split('-');
                  const dateObj = new Date(parseInt(y, 10), parseInt(mm, 10) - 1, 1);
                  const label = dateObj.toLocaleString('en-US', { month: 'short', year: 'numeric' });
                  const active = selectedMonth === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setSelectedMonth(m)}
                      style={[
                        styles.chipBtn,
                        active
                          ? { backgroundColor: theme.accent, borderColor: theme.accent }
                          : { backgroundColor: themeColors.surface2, borderColor: themeColors.line2 },
                      ]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          { color: themeColors.ink },
                          active && { color: '#fff', fontWeight: '700' },
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </Card>
        )}

        {/* YEAR PICKER */}
        {periodType === 'yearly' && (
          <Card style={{ padding: 14, marginTop: 10 }}>
            <Text style={[styles.subHeader, { color: themeColors.ink }]}>Select Year</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {availableYears.map((y) => {
                const active = selectedYear === y;
                return (
                  <Pressable
                    key={y}
                    onPress={() => setSelectedYear(y)}
                    style={[
                      styles.chipBtn,
                      active
                        ? { backgroundColor: theme.accent, borderColor: theme.accent }
                        : { backgroundColor: themeColors.surface2, borderColor: themeColors.line2 },
                    ]}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: themeColors.ink },
                        active && { color: '#fff', fontWeight: '700' },
                      ]}
                    >
                      Year {y}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>
        )}

        {/* CUSTOM RANGE PICKER */}
        {periodType === 'custom' && (
          <Card style={{ padding: 14, marginTop: 10 }}>
            <Text style={[styles.subHeader, { color: themeColors.ink }]}>Date Range (YYYY-MM-DD)</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.ink2 }]}>From Date</Text>
                <TextInput
                  value={customStart}
                  onChangeText={setCustomStart}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={themeColors.ink3}
                  style={[
                    styles.dateInput,
                    { color: themeColors.ink, borderColor: themeColors.line2, backgroundColor: themeColors.surface },
                  ]}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: themeColors.ink2 }]}>To Date</Text>
                <TextInput
                  value={customEnd}
                  onChangeText={setCustomEnd}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={themeColors.ink3}
                  style={[
                    styles.dateInput,
                    { color: themeColors.ink, borderColor: themeColors.line2, backgroundColor: themeColors.surface },
                  ]}
                />
              </View>
            </View>
          </Card>
        )}

        {/* LIVE PERIOD OVERVIEW CARD */}
        <Eyebrow style={{ marginTop: 22, marginBottom: 10 }}>2. Statement Summary</Eyebrow>
        <Card style={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.summaryTitle, { color: themeColors.ink }]}>{activePeriod.label}</Text>
            <View style={[styles.badgePill, { backgroundColor: theme.accentTint }]}>
              <Text style={[styles.badgeText, { color: theme.accent }]}>
                {reportData.incomeStatement.transactionCount} txns
              </Text>
            </View>
          </View>

          <View style={styles.statGrid}>
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: themeColors.ink2 }]}>Revenue</Text>
              <Amount value={isIncome} size={15} color="#15803d" />
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: themeColors.ink2 }]}>Expenses</Text>
              <Amount value={isExpense} size={15} color="#b3261e" />
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: themeColors.ink2 }]}>Net Surplus</Text>
              <Amount value={isNet} size={15} color={isNet >= 0 ? theme.accent : '#b3261e'} />
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: themeColors.ink2 }]}>Net Worth</Text>
              <Amount value={reportData.balanceSheet.netWorth} size={15} />
            </View>
          </View>

          <View style={[styles.statDivider, { backgroundColor: themeColors.line2 }]} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.statSubText, { color: themeColors.ink2 }]}>
              Mean Monthly: <Text style={{ fontFamily: uiFont(700), color: themeColors.ink }}>RM {reportData.statistics.meanMonthlyIncome.toFixed(0)}</Text>
            </Text>
            <Text style={[styles.statSubText, { color: themeColors.ink2 }]}>
              Savings Rate: <Text style={{ fontFamily: uiFont(700), color: theme.accent }}>{reportData.incomeStatement.savingsRate}%</Text>
            </Text>
          </View>
        </Card>

        {/* FORMAT SELECTION */}
        <Eyebrow style={{ marginTop: 22, marginBottom: 10 }}>3. Select Export Format</Eyebrow>
        <View style={{ gap: 10 }}>
          {FORMAT_OPTIONS.map((opt) => {
            const selected = selectedFormat === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => setSelectedFormat(opt.id)}
                style={({ pressed }) => [
                  styles.formatCard,
                  { backgroundColor: themeColors.surface, borderColor: themeColors.line2 },
                  selected && { borderColor: theme.accent, backgroundColor: theme.accentTint },
                  pressed && { opacity: 0.9 },
                ]}
              >
                <View
                  style={[
                    styles.formatIconWrap,
                    { backgroundColor: selected ? theme.accent : themeColors.surface2 },
                  ]}
                >
                  <Icon
                    name={opt.icon}
                    size={20}
                    color={selected ? '#fff' : themeColors.ink2}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.formatTitle, { color: themeColors.ink }, selected && { color: theme.accent }]}>
                      {opt.title}
                    </Text>
                    <View style={[styles.formatBadge, { backgroundColor: themeColors.surface2, borderColor: themeColors.line2 }]}>
                      <Text style={[styles.formatBadgeText, { color: themeColors.ink2 }]}>{opt.badge}</Text>
                    </View>
                  </View>
                  <Text style={[styles.formatSub, { color: themeColors.ink2 }]}>{opt.sub}</Text>
                </View>
                <View
                  style={[
                    styles.radioCircle,
                    { borderColor: themeColors.line },
                    selected && { borderColor: theme.accent, backgroundColor: theme.accent },
                  ]}
                >
                  {selected && <View style={styles.radioDot} />}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* ACTION BUTTONS */}
        <View style={{ marginTop: 26, gap: 10 }}>
          <Pressable
            onPress={handleExport}
            disabled={exporting}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: theme.accentInk, opacity: exporting ? 0.6 : pressed ? 0.92 : 1 },
              platformShadow(theme.accent, 0.35, 10, { width: 0, height: 5 }, 3),
            ]}
          >
            {exporting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Icon name="download" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>
                  {selectedFormat === 'pdf' && Platform.OS === 'web' ? 'Print / Export PDF' : 'Export & Download'}
                </Text>
              </>
            )}
          </Pressable>

          {selectedFormat === 'json' && (
            <Pressable
              onPress={handleCopyJSON}
              disabled={copyingJson}
              style={({ pressed }) => [
                styles.secondaryBtn,
                { backgroundColor: themeColors.surface, borderColor: themeColors.line2 },
                { opacity: copyingJson ? 0.6 : pressed ? 0.85 : 1 },
              ]}
            >
              <Icon name="copy" size={16} color={theme.accent} />
              <Text style={[styles.secondaryBtnText, { color: theme.accent }]}>
                Copy JSON to Clipboard
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={handlePreview}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { backgroundColor: themeColors.surface, borderColor: themeColors.line2 },
              { opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Icon name="sparkles" size={16} color={theme.accent} />
            <Text style={[styles.secondaryBtnText, { color: theme.accent }]}>
              Preview Report Content
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* DOCUMENT PREVIEW MODAL */}
      <Modal
        visible={previewVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPreviewVisible(false)}
      >
        <View style={[styles.previewRoot, { backgroundColor: themeColors.bg }]}>
          <View style={{ paddingTop: insets.top + 6 }}>
            <TopBar
              title={previewTitle || 'Document Preview'}
              onClose={() => setPreviewVisible(false)}
              right={
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {selectedFormat === 'json' && (
                    <Pressable
                      onPress={handleCopyJSON}
                      disabled={copyingJson}
                      style={[styles.modalActionBtn, { backgroundColor: themeColors.surface2 }]}
                    >
                      <Icon name="copy" size={16} color={theme.accent} />
                      <Text style={[styles.modalActionText, { color: theme.accent }]}>Copy</Text>
                    </Pressable>
                  )}
                  <Pressable
                    onPress={() => {
                      setPreviewVisible(false);
                      handleExport();
                    }}
                    style={[styles.modalActionBtn, { backgroundColor: themeColors.surface2 }]}
                  >
                    <Icon name="download" size={16} color={theme.accent} />
                    <Text style={[styles.modalActionText, { color: theme.accent }]}>Export</Text>
                  </Pressable>
                </View>
              }
            />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }}>
            {selectedFormat === 'pdf' || selectedFormat === 'html' ? (
              Platform.OS === 'web' ? (
                // On Web, render in an interactive iframe
                <View style={styles.webPreviewWrap}>
                  <iframe
                    srcDoc={previewContent}
                    title="Report Preview"
                    style={{ width: '100%', height: 600, border: 'none', borderRadius: 8 }}
                  />
                </View>
              ) : (
                <Card style={{ padding: 14 }}>
                  <Text style={[styles.previewRawText, { color: themeColors.ink }]}>{previewContent}</Text>
                </Card>
              )
            ) : (
              <Card style={{ padding: 14 }}>
                <Text style={[styles.previewRawText, { color: themeColors.ink }]}>{previewContent}</Text>
              </Card>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  periodTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.line2,
  },
  periodTabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  periodTabText: {
    fontFamily: uiFont(600),
    fontSize: 13,
    color: colors.ink2,
  },
  periodTabTextActive: {
    color: '#fff',
    fontFamily: uiFont(700),
  },
  subHeader: {
    fontFamily: uiFont(700),
    fontSize: 13,
    color: colors.ink,
  },
  chipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: uiFont(500),
    fontSize: 12.5,
    color: colors.ink,
  },
  inputLabel: {
    fontFamily: uiFont(600),
    fontSize: 11,
    color: colors.ink2,
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  dateInput: {
    fontFamily: uiFont(500),
    fontSize: 13,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  summaryTitle: {
    fontFamily: uiFont(700),
    fontSize: 15,
    color: colors.ink,
  },
  badgePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    fontFamily: uiFont(700),
    fontSize: 11.5,
  },
  statGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  statBox: {
    flex: 1,
  },
  statLabel: {
    fontFamily: uiFont(600),
    fontSize: 11,
    color: colors.ink2,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  statDivider: {
    height: 1,
    backgroundColor: colors.line2,
    marginVertical: 12,
  },
  statSubText: {
    fontFamily: uiFont(500),
    fontSize: 12,
    color: colors.ink2,
  },
  formatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line2,
  },
  formatIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formatTitle: {
    fontFamily: uiFont(700),
    fontSize: 14,
    color: colors.ink,
  },
  formatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line2,
  },
  formatBadgeText: {
    fontFamily: uiFont(600),
    fontSize: 10,
    color: colors.ink2,
  },
  formatSub: {
    fontFamily: uiFont(400),
    fontSize: 12,
    color: colors.ink2,
    marginTop: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 999,
  },
  primaryBtnText: {
    fontFamily: uiFont(700),
    fontSize: 15,
    color: '#fff',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
  },
  secondaryBtnText: {
    fontFamily: uiFont(600),
    fontSize: 13.5,
  },
  previewRoot: {
    flex: 1,
  },
  modalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.surface2,
  },
  modalActionText: {
    fontFamily: uiFont(700),
    fontSize: 13,
  },
  webPreviewWrap: {
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  previewRawText: {
    fontFamily: 'monospace',
    fontSize: 11,
    color: colors.ink,
    lineHeight: 16,
  },
});
