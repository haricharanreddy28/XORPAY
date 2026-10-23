import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'auth/biometric_lock.dart';
import 'auth/session.dart';
import 'common/app_theme.dart';
import 'login/login_screen.dart';
import 'payments/home_screen.dart';

class XorpayApp extends StatelessWidget {
  const XorpayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Xorpay',
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      debugShowCheckedModeBanner: false,
      home: Consumer<Session>(
        builder: (context, session, _) {
          if (!session.isAuthenticated) return const LoginScreen();
          // Gate the authenticated shell behind biometrics.
          return const BiometricLock(child: HomeScreen());
        },
      ),
    );
  }
}
