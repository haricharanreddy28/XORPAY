import 'package:flutter/material.dart';

import 'x_colors.dart';
import 'x_spacing.dart';
import 'x_type.dart';

/// Builds XORPAY [ThemeData] for light and dark. Dark is the hero theme
/// (spec §7.2) — default your `MaterialApp.themeMode` to `ThemeMode.system`.
class XTheme {
  XTheme._();

  static ThemeData light() => _build(XColors.light, Brightness.light);
  static ThemeData dark() => _build(XColors.dark, Brightness.dark);

  static ThemeData _build(XColors xc, Brightness brightness) {
    final base = ThemeData(brightness: brightness, useMaterial3: true);

    final colorScheme = ColorScheme.fromSeed(
      seedColor: xc.primary,
      brightness: brightness,
    ).copyWith(
      primary: xc.primary,
      secondary: xc.secondary,
      surface: xc.bgSurface,
      error: xc.error,
    );

    return base.copyWith(
      colorScheme: colorScheme,
      scaffoldBackgroundColor: xc.bgBase,
      extensions: [xc],
      textTheme: base.textTheme.copyWith(
        displayLarge: XType.display.copyWith(color: xc.textPrimary),
        headlineLarge: XType.h1.copyWith(color: xc.textPrimary),
        headlineMedium: XType.h2.copyWith(color: xc.textPrimary),
        titleLarge: XType.h3.copyWith(color: xc.textPrimary),
        bodyLarge: XType.body.copyWith(color: xc.textPrimary),
        bodyMedium: XType.body.copyWith(color: xc.textSecondary),
        labelSmall: XType.overline.copyWith(color: xc.textMuted),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: xc.bgSurface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(XRadius.input),
          borderSide: BorderSide(color: xc.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(XRadius.input),
          borderSide: BorderSide(color: xc.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(XRadius.input),
          borderSide: BorderSide(color: xc.primary, width: 2),
        ),
      ),
    );
  }
}

/// `context.xc` → the active [XColors]. Falls back to dark (the hero theme)
/// if the extension is somehow missing.
extension XColorsContext on BuildContext {
  XColors get xc => Theme.of(this).extension<XColors>() ?? XColors.dark;
}
