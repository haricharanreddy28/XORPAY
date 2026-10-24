import 'dart:convert';
import 'dart:typed_data';

import '../core/api_client.dart';

/// Talks to the backend /kyc endpoints. All verification happens server-side;
/// the app only sends inputs and reads results.
class KycService {
  KycService._();
  static final KycService instance = KycService._();

  final _dio = ApiClient.instance.dio;

  Future<PanResult> verifyPan(String pan, {String? name}) async {
    final res = await _dio.post('/kyc/pan', data: {'pan': pan, 'name': name});
    return PanResult(
      verified: res.data['verified'] == true,
      registeredName: res.data['registeredName'] as String?,
    );
  }

  Future<GstinResult> verifyGstin(String gstin) async {
    final res = await _dio.post('/kyc/gstin', data: {'gstin': gstin});
    return GstinResult(
      verified: res.data['verified'] == true,
      legalName: res.data['legalName'] as String?,
      status: res.data['status'] as String?,
    );
  }

  /// DigiLocker start. Returns the consent URL + a requestId to complete with.
  Future<AadhaarInit> initAadhaar({String? redirectUrl}) async {
    final res =
        await _dio.post('/kyc/aadhaar/init', data: {'redirectUrl': redirectUrl});
    return AadhaarInit(
      url: res.data['url'] as String?,
      requestId: res.data['requestId'] as String,
    );
  }

  Future<bool> completeAadhaar(String requestId) async {
    final res = await _dio
        .post('/kyc/aadhaar/complete', data: {'requestId': requestId});
    return res.data['verified'] == true;
  }

  /// Liveness session for the Face SDK; returns an sdkToken to drive capture.
  Future<SelfieSession> selfieSession() async {
    final res = await _dio.post('/kyc/selfie/session');
    return SelfieSession(
      sessionId: res.data['sessionId'] as String,
      sdkToken: res.data['sdkToken'] as String?,
    );
  }

  Future<bool> completeSelfie(String sessionId, Uint8List imageBytes) async {
    final res = await _dio.post('/kyc/selfie/complete', data: {
      'sessionId': sessionId,
      'imageMimeType': 'image/jpeg',
      'imageBase64': base64Encode(imageBytes),
    });
    return res.data['verified'] == true;
  }
}

class PanResult {
  const PanResult({required this.verified, this.registeredName});
  final bool verified;
  final String? registeredName;
}

class GstinResult {
  const GstinResult({required this.verified, this.legalName, this.status});
  final bool verified;
  final String? legalName;
  final String? status;
}

class AadhaarInit {
  const AadhaarInit({required this.requestId, this.url});
  final String requestId;
  final String? url;
}

class SelfieSession {
  const SelfieSession({required this.sessionId, this.sdkToken});
  final String sessionId;
  final String? sdkToken;
}
