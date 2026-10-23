import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:xorpay_ui/xorpay_ui.dart';

import 'auth/biometric_lock.dart';
import 'auth/session.dart';
import 'core/secure_storage.dart';
import 'onboarding/intro_carousel.dart';
import 'onboarding/login_screen.dart';
import 'onboarding/splash_screen.dart';
import 'payments/home_screen.dart';

class XorpayApp extends StatelessWidget {
  const XorpayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'XORPAY',
      theme: XTheme.light(),
      darkTheme: XTheme.dark(),
      themeMode: ThemeMode.system, // dark is the hero theme
      debugShowCheckedModeBanner: false,
      home: const _AppFlow(),
    );
  }
}

/// Drives: splash → (intro once) → login → (biometric) home.
/// Auth state stays reactive via [Session] so logout returns to login.
class _AppFlow extends StatefulWidget {
  const _AppFlow();

  @override
  State<_AppFlow> createState() => _AppFlowState();
}

class _AppFlowState extends State<_AppFlow> {
  bool _splashDone = false;
  bool _introSeen = true; // assume seen until we learn otherwise

  @override
  void initState() {
    super.initState();
    SecureStore.instance.introSeen.then((v) {
      if (mounted) setState(() => _introSeen = v);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (!_splashDone) {
      return SplashScreen(onDone: () => setState(() => _splashDone = true));
    }

    return Consumer<Session>(
      builder: (context, session, _) {
        if (session.isAuthenticated) {
          return const BiometricLock(child: HomeScreen());
        }
        if (!_introSeen) {
          return IntroCarousel(
            onFinish: () {
              SecureStore.instance.markIntroSeen();
              setState(() => _introSeen = true);
            },
          );
        }
        return const LoginScreen();
      },
    );
  }
}
