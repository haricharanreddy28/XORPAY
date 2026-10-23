import 'package:flutter/material.dart';

/// XORPAY colour tokens (spec §7.2), exposed as a [ThemeExtension] so widgets
/// read brand colours via `Theme.of(context).extension<XColors>()` —
/// or the `context.xc` shortcut in `x_theme.dart`.
///
/// Dark mode is the hero theme; the purple glow is the signature.
@immutable
class XColors extends ThemeExtension<XColors> {
  const XColors({
    required this.primary,
    required this.secondary,
    required this.brandGradient,
    required this.glow,
    required this.bgBase,
    required this.bgSurface,
    required this.bgElevated,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.border,
    required this.success,
    required this.warning,
    required this.error,
    required this.rewardGold,
  });

  final Color primary;
  final Color secondary;

  /// 135° hero gradient (CTAs, hero cards, logo).
  final List<Color> brandGradient;

  /// Soft purple glow used for button/card shadows.
  final Color glow;

  final Color bgBase;
  final Color bgSurface;
  final Color bgElevated;

  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;

  final Color border;

  final Color success;
  final Color warning;
  final Color error;

  /// Gold gradient for coins/cashback.
  final List<Color> rewardGold;

  static const light = XColors(
    primary: Color(0xFF6C2BD9),
    secondary: Color(0xFF2563EB),
    brandGradient: [Color(0xFF2563EB), Color(0xFF6C2BD9), Color(0xFFA855F7)],
    glow: Color(0x4DA855F7), // #A855F7 @ 30%
    bgBase: Color(0xFFF7F6FB),
    bgSurface: Color(0xFFFFFFFF),
    bgElevated: Color(0xFFFFFFFF),
    textPrimary: Color(0xFF14121F),
    textSecondary: Color(0xFF5B5770),
    textMuted: Color(0xFF8E89A3),
    border: Color(0xFFE8E5F2),
    success: Color(0xFF12B76A),
    warning: Color(0xFFF79009),
    error: Color(0xFFF04438),
    rewardGold: [Color(0xFFF5B700), Color(0xFFFFD95A)],
  );

  static const dark = XColors(
    primary: Color(0xFF8B5CF6),
    secondary: Color(0xFF3B82F6),
    brandGradient: [Color(0xFF2563EB), Color(0xFF6C2BD9), Color(0xFFA855F7)],
    glow: Color(0x66A855F7), // #A855F7 @ 40%
    bgBase: Color(0xFF0B0A12), // near-black purple
    bgSurface: Color(0xFF15131F),
    bgElevated: Color(0xFF1E1B2B),
    textPrimary: Color(0xFFF5F3FF),
    textSecondary: Color(0xFFA9A4BF),
    textMuted: Color(0xFF6E6985),
    border: Color(0xFF2A2640),
    success: Color(0xFF32D583),
    warning: Color(0xFFFDB022),
    error: Color(0xFFF97066),
    rewardGold: [Color(0xFFF5B700), Color(0xFFFFD95A)],
  );

  @override
  XColors copyWith({
    Color? primary,
    Color? secondary,
    List<Color>? brandGradient,
    Color? glow,
    Color? bgBase,
    Color? bgSurface,
    Color? bgElevated,
    Color? textPrimary,
    Color? textSecondary,
    Color? textMuted,
    Color? border,
    Color? success,
    Color? warning,
    Color? error,
    List<Color>? rewardGold,
  }) {
    return XColors(
      primary: primary ?? this.primary,
      secondary: secondary ?? this.secondary,
      brandGradient: brandGradient ?? this.brandGradient,
      glow: glow ?? this.glow,
      bgBase: bgBase ?? this.bgBase,
      bgSurface: bgSurface ?? this.bgSurface,
      bgElevated: bgElevated ?? this.bgElevated,
      textPrimary: textPrimary ?? this.textPrimary,
      textSecondary: textSecondary ?? this.textSecondary,
      textMuted: textMuted ?? this.textMuted,
      border: border ?? this.border,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      error: error ?? this.error,
      rewardGold: rewardGold ?? this.rewardGold,
    );
  }

  @override
  XColors lerp(ThemeExtension<XColors>? other, double t) {
    if (other is! XColors) return this;
    return XColors(
      primary: Color.lerp(primary, other.primary, t)!,
      secondary: Color.lerp(secondary, other.secondary, t)!,
      brandGradient: _lerpList(brandGradient, other.brandGradient, t),
      glow: Color.lerp(glow, other.glow, t)!,
      bgBase: Color.lerp(bgBase, other.bgBase, t)!,
      bgSurface: Color.lerp(bgSurface, other.bgSurface, t)!,
      bgElevated: Color.lerp(bgElevated, other.bgElevated, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
      border: Color.lerp(border, other.border, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      error: Color.lerp(error, other.error, t)!,
      rewardGold: _lerpList(rewardGold, other.rewardGold, t),
    );
  }

  static List<Color> _lerpList(List<Color> a, List<Color> b, double t) {
    final n = a.length < b.length ? a.length : b.length;
    return [for (var i = 0; i < n; i++) Color.lerp(a[i], b[i], t)!];
  }

  /// Convenience: the 135° brand gradient as a [LinearGradient].
  LinearGradient get gradient => LinearGradient(
        colors: brandGradient,
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
      );
}
