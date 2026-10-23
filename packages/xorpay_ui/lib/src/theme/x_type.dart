import 'package:flutter/widgets.dart';
import 'package:google_fonts/google_fonts.dart';

/// XORPAY type scale (spec §7.3).
///
/// Headings and amounts: **Sora** (geometric, matches the X logo).
/// Body: **Inter**. Numbers use tabular figures for stable alignment.
class XType {
  XType._();

  static const _tabular = [FontFeature.tabularFigures()];

  static TextStyle get display => GoogleFonts.sora(
        fontSize: 40,
        height: 48 / 40,
        fontWeight: FontWeight.w700,
        fontFeatures: _tabular,
      );

  static TextStyle get h1 => GoogleFonts.sora(
        fontSize: 28,
        height: 36 / 28,
        fontWeight: FontWeight.w700,
      );

  static TextStyle get h2 => GoogleFonts.sora(
        fontSize: 22,
        height: 30 / 22,
        fontWeight: FontWeight.w600,
      );

  static TextStyle get h3 => GoogleFonts.sora(
        fontSize: 18,
        height: 26 / 18,
        fontWeight: FontWeight.w600,
      );

  static TextStyle get body => GoogleFonts.inter(
        fontSize: 16,
        height: 24 / 16,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get caption => GoogleFonts.inter(
        fontSize: 13,
        height: 18 / 13,
        fontWeight: FontWeight.w400,
      );

  static TextStyle get overline => GoogleFonts.inter(
        fontSize: 11,
        height: 16 / 11,
        fontWeight: FontWeight.w600,
        letterSpacing: 11 * 0.08, // +8% tracking
      );

  /// Amount style — Sora, tabular. Used by [XAmount] and the AmountPad.
  static TextStyle amount(double size) => GoogleFonts.sora(
        fontSize: size,
        height: 1.1,
        fontWeight: FontWeight.w700,
        fontFeatures: _tabular,
      );
}
