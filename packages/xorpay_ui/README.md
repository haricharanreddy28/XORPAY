# xorpay_ui

The **XORPAY** design system — brand tokens, theme, typography, utilities and
components. Implements spec Section 7. Build everything else on top of this.

> Dark mode is the hero theme; the purple glow is the signature.

## Use it

In the app's `pubspec.yaml` (path dependency):
```yaml
dependencies:
  xorpay_ui:
    path: ../packages/xorpay_ui
```

```dart
import 'package:xorpay_ui/xorpay_ui.dart';

MaterialApp(
  theme: XTheme.light(),
  darkTheme: XTheme.dark(),
  themeMode: ThemeMode.system,
  home: const Home(),
);
```

Reach brand colours anywhere via `context.xc`:
```dart
Container(decoration: BoxDecoration(gradient: context.xc.gradient));
Text('Paid', style: TextStyle(color: context.xc.success));
```

## What's in (so far)

| Item | File | Spec |
|---|---|---|
| Colour tokens (light/dark, as `ThemeExtension`) | `src/theme/x_colors.dart` | §7.2 |
| Type scale (Sora / Inter, tabular figures) | `src/theme/x_type.dart` | §7.3 |
| Spacing + radius (8-pt grid) | `src/theme/x_spacing.dart` | §7.4 |
| Indian money format `₹1,25,000.00` | `src/util/x_money.dart` | §7.3 |
| Fee math (2% + 18% GST on fee), pure | `src/util/x_fee.dart` | §9 |
| `XTheme.light()/dark()` + `context.xc` | `src/theme/x_theme.dart` | §7.2 |
| `XButton` (gradient, glow, press, loading shimmer) | `src/components/x_button.dart` | §7.5 |
| `AmountPad` (auto-scale amount, keypad, chips, live breakdown) | `src/components/amount_pad.dart` | §7.5 |
| `PayeeTile` (gradient initials, verified badge, masked acct) | `src/components/payee_tile.dart` | §7.5 |
| `XCard3D` (issuer gradient, chip, gyro tilt ±6°) | `src/components/x_card_3d.dart` | §7.5 |

> Card network names render as **text labels**, not brand logos (logos are
> trademarks). `XCard3D` tilt needs a gyroscope; it stays flat where there's none.

## Still to come in this package (next phases of §7.5)
`FeeBreakdownSheet`, `StatusTimeline`, `XBottomSheet`, `CategoryGrid`,
`CoinBadge`, empty states, skeleton loaders, inputs — plus a **Widgetbook**
catalogue and the app-icon/splash assets.

## Fonts
Uses `google_fonts` to fetch Sora + Inter at runtime (no bundled files). For
offline/production, bundle the `.ttf`s and set `GoogleFonts.config` accordingly.

## Test
```bash
cd packages/xorpay_ui && flutter test
```
