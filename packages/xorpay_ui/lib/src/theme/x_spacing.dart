/// Spacing, radius and shape tokens (spec §7.4). 8-pt grid.
class XSpacing {
  XSpacing._();

  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16; // card padding
  static const double xl = 20; // screen padding
  static const double xxl = 24;
  static const double xxxl = 32;

  /// Standard screen edge padding.
  static const double screen = 20;

  /// Standard card inner padding.
  static const double card = 16;
}

/// Corner radii (spec §7.4).
class XRadius {
  XRadius._();

  static const double button = 16;
  static const double card = 20;
  static const double sheet = 28; // top corners of bottom sheets
  static const double input = 14;
  static const double pill = 999; // chips
}
