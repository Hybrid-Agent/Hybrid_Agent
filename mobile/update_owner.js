const fs = require('fs');
const file = 'screens/OwnerWithdrawScreen.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add imports
content = content.replace(
  "import type { RootStackParamList } from '../navigation/types';",
  "import type { RootStackParamList } from '../navigation/types';\nimport { useAppTheme, type Theme } from '../lib/theme';"
);

// 2. Remove constant definitions
content = content.replace(/const NAVY\s*=\s*'[^']+';\n/g, '');
content = content.replace(/const GOLD\s*=\s*'[^']+';\n/g, '');
content = content.replace(/const GOLD_L\s*=\s*'[^']+';\n/g, '');
content = content.replace(/const GREEN\s*=\s*'[^']+';\n/g, '');

// 3. Inject hooks in main component
content = content.replace(
  "export default function OwnerWithdrawScreen() {",
  "export default function OwnerWithdrawScreen() {\n  const theme = useAppTheme();\n  const styles = makeStyles(theme);"
);

// 4. Update StatusBar
content = content.replace(
  '<StatusBar barStyle="dark-content" backgroundColor="#fff" />',
  '<StatusBar barStyle={theme.background === "#111827" ? "light-content" : "dark-content"} backgroundColor={theme.background} />'
);

// 5. Replace inline constants in JSX
content = content.replace(/\bNAVY\b/g, "theme.navy");
content = content.replace(/\bGOLD\b/g, "theme.gold");
content = content.replace(/\bGREEN\b/g, "theme.green");
content = content.replace(/\bGOLD_L\b/g, "(theme.background === '#111827' ? '#78350f' : '#fdf3e3')");

// 6. Fix BreakdownRow
content = content.replace(
  /function BreakdownRow\([\s\S]*?\}\)/,
  `function BreakdownRow({
  label, value, bold, valueSmall, valueColor,
}: {
  label: string; value: string; bold?: boolean; valueSmall?: boolean; valueColor?: string;
}) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <Text style={[
        styles.breakdownValue,
        bold       && { fontWeight: '800', color: theme.navy },
        valueSmall && { fontSize: 11, maxWidth: 160, textAlign: 'right' },
        valueColor ? { color: valueColor } : null,
      ]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}`
);
content = content.replace(
  /function SummaryRow\([\s\S]*?\}\)/,
  `function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const theme = useAppTheme();
  const styles = makeStyles(theme);
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, bold && { fontWeight: '800', color: theme.navy }]}>{value}</Text>
    </View>
  );
}`
);

// 7. Make Stylesheet dynamic
content = content.replace(
  "const styles = StyleSheet.create({",
  "const makeStyles = (theme: Theme) => StyleSheet.create({"
);
content = content.replace(/backgroundColor:\s*'#f9fafb'/g, "backgroundColor: theme.background");
content = content.replace(/backgroundColor:\s*'#fff'/g, "backgroundColor: theme.card");
content = content.replace(/borderColor:\s*'#f3f4f6'/g, "borderColor: theme.border");
content = content.replace(/borderColor:\s*'#e5e7eb'/g, "borderColor: theme.border");
content = content.replace(/color:\s*'#374151'/g, "color: theme.text");
content = content.replace(/color:\s*'#111827'/g, "color: theme.text");
content = content.replace(/color:\s*'#6b7280'/g, "color: theme.textSecondary");
content = content.replace(/color:\s*'#94a3b8'/g, "color: theme.textSecondary");
content = content.replace(/color:\s*'#9ca3af'/g, "color: theme.textSecondary");

fs.writeFileSync(file, content);
