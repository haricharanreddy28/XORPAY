import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

/// Six animated OTP boxes (spec §7.7). A single hidden field captures input
/// (so OS SMS autofill works via [AutofillHints.oneTimeCode]); the boxes are
/// a presentation layer over its value. The active box gets a purple focus glow.
class XOtpField extends StatefulWidget {
  const XOtpField({
    super.key,
    this.length = 6,
    this.onChanged,
    this.onCompleted,
    this.error = false,
    this.enabled = true,
  });

  final int length;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onCompleted;
  final bool error;
  final bool enabled;

  @override
  State<XOtpField> createState() => _XOtpFieldState();
}

class _XOtpFieldState extends State<XOtpField> {
  final _controller = TextEditingController();
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    setState(() {});
    widget.onChanged?.call(v);
    if (v.length == widget.length) {
      _focus.unfocus();
      widget.onCompleted?.call(v);
    }
  }

  @override
  Widget build(BuildContext context) {
    final value = _controller.text;
    return GestureDetector(
      onTap: widget.enabled ? () => _focus.requestFocus() : null,
      child: Stack(
        children: [
          // Hidden capture field.
          Positioned.fill(
            child: IgnorePointer(
              child: Opacity(
                opacity: 0,
                child: TextField(
                  controller: _controller,
                  focusNode: _focus,
                  enabled: widget.enabled,
                  keyboardType: TextInputType.number,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  maxLength: widget.length,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(widget.length),
                  ],
                  onChanged: _onChanged,
                ),
              ),
            ),
          ),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              for (var i = 0; i < widget.length; i++)
                _Box(
                  char: i < value.length ? value[i] : '',
                  active: _focus.hasFocus && i == value.length,
                  error: widget.error,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Box extends StatelessWidget {
  const _Box({required this.char, required this.active, required this.error});
  final String char;
  final bool active;
  final bool error;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    final borderColor = error
        ? xc.error
        : active
            ? xc.primary
            : xc.border;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 150),
      width: 48,
      height: 56,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: xc.bgSurface,
        borderRadius: BorderRadius.circular(XRadius.input),
        border: Border.all(color: borderColor, width: active ? 2 : 1),
        boxShadow: active
            ? [BoxShadow(color: xc.glow, blurRadius: 12, spreadRadius: 1)]
            : null,
      ),
      child: Text(
        char,
        style: XType.h2.copyWith(color: xc.textPrimary),
      ),
    );
  }
}
