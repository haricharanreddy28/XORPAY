import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'auth/session.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final session = Session();
  await session.bootstrap();

  // TODO (fintech hardening): initialize freerasp here and react to
  // root/hook/debugger/tamper signals before showing any sensitive screen.
  //
  // NOTE: Sentry crash reporting was removed for now — sentry_flutter's Kotlin
  // didn't compile against the current Flutter toolchain. Re-add a compatible
  // sentry_flutter version (wrapping runApp in SentryFlutter.init) when needed.

  runApp(
    ChangeNotifierProvider.value(
      value: session,
      child: const XorpayApp(),
    ),
  );
}
