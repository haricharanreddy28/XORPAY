import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'card_text_parser.dart';

/// Scans a physical card with the camera and ML Kit text recognition, then
/// hands the detected number/expiry back to the add-card form via [onExtracted].
/// Needs camera permission (CAMERA on Android, NSCameraUsageDescription on iOS).
class ScanCardView extends StatefulWidget {
  const ScanCardView({super.key, required this.onExtracted});
  final void Function(String? number, String? expiry) onExtracted;

  @override
  State<ScanCardView> createState() => _ScanCardViewState();
}

class _ScanCardViewState extends State<ScanCardView> {
  CameraController? _controller;
  final _recognizer = TextRecognizer(script: TextRecognitionScript.latin);
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initCamera();
  }

  Future<void> _initCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        setState(() => _error = 'No camera available on this device.');
        return;
      }
      final back = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );
      final controller = CameraController(
        back,
        ResolutionPreset.high,
        enableAudio: false,
      );
      await controller.initialize();
      if (!mounted) return;
      setState(() => _controller = controller);
    } catch (_) {
      setState(() => _error = 'Couldn’t open the camera. Check permissions.');
    }
  }

  Future<void> _capture() async {
    final controller = _controller;
    if (controller == null || _busy) return;
    setState(() => _busy = true);
    try {
      final file = await controller.takePicture();
      final recognized =
          await _recognizer.processImage(InputImage.fromFilePath(file.path));
      final card = parseCardText(recognized.text);
      if (card.hasAny) {
        widget.onExtracted(card.number, card.expiry);
      } else {
        setState(() => _error = 'Couldn’t read the card. Try again, steady and well-lit.');
      }
    } catch (_) {
      setState(() => _error = 'Scan failed. Please try again.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _controller?.dispose();
    _recognizer.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    if (_error != null && _controller == null) {
      return _Message(icon: Icons.no_photography_outlined, text: _error!);
    }
    final controller = _controller;
    if (controller == null) {
      return const Center(child: CircularProgressIndicator());
    }

    return Column(
      children: [
        Expanded(
          child: Stack(
            fit: StackFit.expand,
            children: [
              CameraPreview(controller),
              // Card-shaped guide overlay.
              Center(
                child: AspectRatio(
                  aspectRatio: 1.586,
                  child: Container(
                    margin: const EdgeInsets.all(XSpacing.xxl),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.white, width: 2),
                      borderRadius: BorderRadius.circular(XRadius.card),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.all(XSpacing.xl),
          child: Column(
            children: [
              Text(
                _error ?? 'Line the card up inside the frame.',
                textAlign: TextAlign.center,
                style: XType.caption.copyWith(
                  color: _error != null ? xc.error : xc.textSecondary,
                ),
              ),
              const SizedBox(height: XSpacing.md),
              XButton(label: 'Capture', loading: _busy, onPressed: _capture),
            ],
          ),
        ),
      ],
    );
  }
}

class _Message extends StatelessWidget {
  const _Message({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(XSpacing.xxxl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 64, color: xc.textMuted),
            const SizedBox(height: XSpacing.lg),
            Text(text,
                textAlign: TextAlign.center,
                style: XType.body.copyWith(color: xc.textSecondary)),
          ],
        ),
      ),
    );
  }
}
