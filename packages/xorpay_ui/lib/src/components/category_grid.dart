import 'package:flutter/material.dart';

import '../theme/x_spacing.dart';
import '../theme/x_theme.dart';
import '../theme/x_type.dart';

/// A home quick-action: an icon in a tinted rounded square + a label.
class CategoryItem {
  const CategoryItem({required this.icon, required this.label, required this.onTap});
  final IconData icon;
  final String label;
  final VoidCallback onTap;
}

/// Grid of payment categories (spec §3.1, §7.5). Defaults to 4 columns.
class CategoryGrid extends StatelessWidget {
  const CategoryGrid({super.key, required this.items, this.crossAxisCount = 4});
  final List<CategoryItem> items;
  final int crossAxisCount;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: crossAxisCount,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: XSpacing.md,
      crossAxisSpacing: XSpacing.md,
      childAspectRatio: 0.82,
      children: [for (final it in items) _Cell(item: it)],
    );
  }
}

class _Cell extends StatelessWidget {
  const _Cell({required this.item});
  final CategoryItem item;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return InkWell(
      onTap: item.onTap,
      borderRadius: BorderRadius.circular(XRadius.input),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 52,
            height: 52,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: xc.primary.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(XRadius.input),
            ),
            child: Icon(item.icon, color: xc.primary, size: 26),
          ),
          const SizedBox(height: 6),
          Text(
            item.label,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: XType.caption.copyWith(color: xc.textSecondary),
          ),
        ],
      ),
    );
  }
}
