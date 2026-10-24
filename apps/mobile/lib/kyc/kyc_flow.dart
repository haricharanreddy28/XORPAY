import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'kyc_controller.dart';

/// KYC onboarding shell (spec §4 steps 5–7, §7.7). Progress stepper on top,
/// one step per screen, each explaining *why* in a line. Calls [onFinish]
/// after the Done step. Verification logic is stubbed for Phase 2.
class KycFlow extends StatelessWidget {
  const KycFlow({super.key, required this.onFinish});
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (_) => KycController(),
      child: _KycScaffold(onFinish: onFinish),
    );
  }
}

class _KycScaffold extends StatelessWidget {
  const _KycScaffold({required this.onFinish});
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    final kyc = context.watch<KycController>();
    final onFirst = kyc.index == 0;
    final onDone = kyc.index == KycController.steps.length - 1;

    return Scaffold(
      appBar: AppBar(
        leading: onFirst || onDone
            ? null
            : IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: context.read<KycController>().back,
              ),
        title: const Text('Verify your identity'),
        centerTitle: false,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(XSpacing.xl),
          child: Column(
            children: [
              XStepper(steps: KycController.steps, currentIndex: kyc.index),
              const SizedBox(height: XSpacing.xxxl),
              Expanded(
                child: AnimatedSwitcher(
                  duration: const Duration(milliseconds: 240),
                  child: switch (kyc.index) {
                    0 => const _PanStep(),
                    1 => const _AadhaarStep(),
                    2 => const _SelfieStep(),
                    _ => _DoneStep(onFinish: onFinish),
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Shared layout: a "why" line, body content, and a bottom CTA.
class _StepLayout extends StatelessWidget {
  const _StepLayout({
    required this.title,
    required this.why,
    required this.child,
    required this.cta,
    required this.onCta,
    this.ctaEnabled = true,
    this.busy = false,
    this.error,
    super.key,
  });

  final String title;
  final String why;
  final Widget child;
  final String cta;
  final VoidCallback onCta;
  final bool ctaEnabled;
  final bool busy;
  final String? error;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Column(
      key: ValueKey(title),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(title, style: XType.h2.copyWith(color: xc.textPrimary)),
        const SizedBox(height: XSpacing.sm),
        Text(why, style: XType.caption.copyWith(color: xc.textSecondary)),
        const SizedBox(height: XSpacing.xxl),
        Expanded(child: child),
        if (error != null) ...[
          Text(error!, style: XType.caption.copyWith(color: xc.error)),
          const SizedBox(height: XSpacing.md),
        ],
        XButton(
          label: cta,
          loading: busy,
          onPressed: (ctaEnabled && !busy) ? onCta : null,
        ),
      ],
    );
  }
}

// ---- Step 1: PAN ---------------------------------------------------------
class _PanStep extends StatefulWidget {
  const _PanStep();
  @override
  State<_PanStep> createState() => _PanStepState();
}

class _PanStepState extends State<_PanStep> {
  final _controller = TextEditingController();
  // PAN format: 5 letters, 4 digits, 1 letter.
  static final _panRe = RegExp(r'^[A-Z]{5}[0-9]{4}[A-Z]$');
  bool get _valid => _panRe.hasMatch(_controller.text);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    final kyc = context.watch<KycController>();
    return _StepLayout(
      title: 'Your PAN',
      why: 'Required by RBI for business payments and to set your limits.',
      ctaEnabled: _valid,
      busy: kyc.busy,
      error: kyc.error,
      cta: 'Continue',
      onCta: () => context.read<KycController>().submitPan(_controller.text),
      child: Align(
        alignment: Alignment.topCenter,
        child: TextField(
          controller: _controller,
          autofocus: true,
          textCapitalization: TextCapitalization.characters,
          inputFormatters: [
            LengthLimitingTextInputFormatter(10),
            FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
            TextInputFormatter.withFunction(
              (_, n) => n.copyWith(text: n.text.toUpperCase()),
            ),
          ],
          onChanged: (_) => setState(() {}),
          style: XType.h3.copyWith(color: xc.textPrimary, letterSpacing: 2),
          textAlign: TextAlign.center,
          decoration: const InputDecoration(
            labelText: 'PAN (ABCDE1234F)',
            counterText: '',
          ),
        ),
      ),
    );
  }
}

// ---- Step 2: Aadhaar -----------------------------------------------------
class _AadhaarStep extends StatelessWidget {
  const _AadhaarStep();
  @override
  Widget build(BuildContext context) {
    final kyc = context.watch<KycController>();
    return _StepLayout(
      title: 'Aadhaar KYC',
      why: 'Verified instantly via DigiLocker — we never store your Aadhaar number.',
      busy: kyc.busy,
      error: kyc.error,
      cta: 'Verify with DigiLocker',
      onCta: () => context.read<KycController>().submitAadhaar(),
      child: const _CenterIcon(icon: Icons.account_balance_rounded),
    );
  }
}

// ---- Step 3: Selfie ------------------------------------------------------
class _SelfieStep extends StatelessWidget {
  const _SelfieStep();

  Future<void> _capture(BuildContext context) async {
    try {
      final cameras = await availableCameras();
      final camera = cameras.firstWhere(
        (item) => item.lensDirection == CameraLensDirection.front,
        orElse: () => cameras.first,
      );
      if (!context.mounted) return;
      final image = await Navigator.of(context).push<Uint8List>(
        MaterialPageRoute(builder: (_) => _SelfieCapturePage(camera: camera)),
      );
      if (image != null && context.mounted) {
        await context.read<KycController>().submitSelfie(image);
      }
    } catch (_) {
      if (context.mounted) {
        context.read<KycController>().showError(
          'Camera unavailable. Check camera permission and try again.',
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    final kyc = context.watch<KycController>();
    return _StepLayout(
      title: 'Quick selfie',
      why: 'Cashfree checks that your selfie is live to help prevent fraud.',
      busy: kyc.busy,
      error: kyc.error,
      cta: 'Take selfie',
      onCta: () => _capture(context),
      child: Center(
        child: Container(
          width: 200,
          height: 240,
          decoration: BoxDecoration(
            border: Border.all(color: xc.primary, width: 2),
            borderRadius: const BorderRadius.all(Radius.elliptical(100, 120)),
          ),
          child: Icon(Icons.face_retouching_natural,
              size: 96, color: xc.textMuted),
        ),
      ),
    );
  }
}

class _SelfieCapturePage extends StatefulWidget {
  const _SelfieCapturePage({required this.camera});
  final CameraDescription camera;

  @override
  State<_SelfieCapturePage> createState() => _SelfieCapturePageState();
}

class _SelfieCapturePageState extends State<_SelfieCapturePage> {
  late final CameraController _camera =
      CameraController(widget.camera, ResolutionPreset.medium, enableAudio: false);
  late final Future<void> _initialized = _camera.initialize();
  bool _capturing = false;

  @override
  void dispose() {
    _camera.dispose();
    super.dispose();
  }

  Future<void> _takePicture() async {
    if (_capturing) return;
    setState(() => _capturing = true);
    try {
      await _initialized;
      final file = await _camera.takePicture();
      final bytes = await file.readAsBytes();
      if (mounted) Navigator.of(context).pop(bytes);
    } catch (_) {
      if (mounted) setState(() => _capturing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Take a selfie')),
      body: FutureBuilder<void>(
        future: _initialized,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return const Center(child: Text('Camera could not be started.'));
          }
          if (snapshot.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          return Stack(
            fit: StackFit.expand,
            children: [
              CameraPreview(_camera),
              Align(
                alignment: Alignment.center,
                child: Container(
                  width: 240,
                  height: 300,
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.white, width: 2),
                    borderRadius: const BorderRadius.all(Radius.elliptical(120, 150)),
                  ),
                ),
              ),
              Positioned(
                left: 24,
                right: 24,
                bottom: 24,
                child: FilledButton(
                  onPressed: _capturing ? null : _takePicture,
                  child: Text(_capturing ? 'Checking…' : 'Capture selfie'),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ---- Step 4: Done --------------------------------------------------------
class _DoneStep extends StatelessWidget {
  const _DoneStep({required this.onFinish});
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return _StepLayout(
      key: const ValueKey('Done'),
      title: 'You’re verified',
      why: 'Your account is ready. Higher limits unlock as you add GST details.',
      cta: 'Go to dashboard',
      onCta: onFinish,
      child: Center(
        child: Container(
          width: 120,
          height: 120,
          decoration: BoxDecoration(
            gradient: xc.gradient,
            shape: BoxShape.circle,
            boxShadow: [BoxShadow(color: xc.glow, blurRadius: 40, spreadRadius: 4)],
          ),
          child: const Icon(Icons.check_rounded, size: 64, color: Colors.white),
        ),
      ),
    );
  }
}

class _CenterIcon extends StatelessWidget {
  const _CenterIcon({required this.icon});
  final IconData icon;
  @override
  Widget build(BuildContext context) {
    final xc = context.xc;
    return Center(
      child: Container(
        width: 120,
        height: 120,
        decoration: BoxDecoration(
          color: xc.bgSurface,
          shape: BoxShape.circle,
          border: Border.all(color: xc.border),
        ),
        child: Icon(icon, size: 56, color: xc.primary),
      ),
    );
  }
}
