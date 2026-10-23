/// XORPAY design system — tokens, theme, typography, utilities and components.
///
/// Usage:
///   MaterialApp(
///     theme: XTheme.light(),
///     darkTheme: XTheme.dark(),
///     themeMode: ThemeMode.system, // dark is the hero theme
///   );
///
/// Then reach brand colours anywhere via `context.xc`.
library xorpay_ui;

export 'src/theme/x_colors.dart';
export 'src/theme/x_type.dart';
export 'src/theme/x_spacing.dart';
export 'src/theme/x_theme.dart';
export 'src/util/x_money.dart';
export 'src/util/x_fee.dart';
export 'src/components/x_button.dart';
export 'src/components/amount_pad.dart';
export 'src/components/payee_tile.dart';
export 'src/components/x_card_3d.dart';
export 'src/components/x_stepper.dart';
export 'src/components/fee_breakdown_sheet.dart';
export 'src/components/status_timeline.dart';
