import 'dart:async';

import 'package:flutter/widgets.dart';

/// Re-locks the app after a period of inactivity (spec §6: session timeout).
/// Any pointer interaction resets the timer; [onTimeout] fires when it elapses.
class InactivityDetector extends StatefulWidget {
  const InactivityDetector({
    super.key,
    required this.child,
    required this.onTimeout,
    this.timeout = const Duration(minutes: 3),
  });

  final Widget child;
  final VoidCallback onTimeout;
  final Duration timeout;

  @override
  State<InactivityDetector> createState() => _InactivityDetectorState();
}

class _InactivityDetectorState extends State<InactivityDetector> {
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _reset();
  }

  void _reset([_]) {
    _timer?.cancel();
    _timer = Timer(widget.timeout, widget.onTimeout);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: _reset,
      onPointerMove: _reset,
      child: widget.child,
    );
  }
}
