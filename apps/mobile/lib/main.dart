import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:sentry_flutter/sentry_flutter.dart';

import 'app.dart';
import 'auth/session.dart';
import 'core/config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  final session = Session();
  await session.bootstrap();

  // TODO (fintech hardening): initialize freerasp here and react to
  // root/hook/debugger/tamper signals before showing any sensitive screen.

  Widget root() => ChangeNotifierProvider.value(
        value: session,
        child: const XorpayApp(),
      );

  if (AppConfig.sentryDsn.isEmpty) {
    runApp(root());
  } else {
    await SentryFlutter.init(
      (o) => o.dsn = AppConfig.sentryDsn,
      appRunner: () => runApp(root()),
    );
  }
}
