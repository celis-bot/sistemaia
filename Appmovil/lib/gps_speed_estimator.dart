import 'dart:collection';
import 'dart:math' as math;

import 'package:geolocator/geolocator.dart';

class SpeedEstimate {
  const SpeedEstimate({
    required this.speedKmh,
    required this.accuracyMeters,
    required this.hasFix,
    required this.isMocked,
    required this.timestamp,
  });

  final double speedKmh;
  final double? accuracyMeters;
  final bool hasFix;
  final bool isMocked;
  final DateTime timestamp;
}

class GpsSpeedEstimator {
  GpsSpeedEstimator({
    this.window = const Duration(seconds: 4),
    this.maxPlausibleSpeedKmh = 300,
  });

  final Duration window;
  final double maxPlausibleSpeedKmh;

  final ListQueue<_GpsFix> _fixes = ListQueue<_GpsFix>();
  final List<double> _recentCandidates = <double>[];
  double _smoothedSpeedKmh = 0;

  SpeedEstimate addPosition(Position position) {
    final timestamp = position.timestamp;
    final accuracyMeters = position.hasAccuracy ? position.accuracy : null;
    final isValid = position.latitude.isFinite &&
        position.longitude.isFinite &&
        position.latitude >= -90 &&
        position.latitude <= 90 &&
        position.longitude >= -180 &&
        position.longitude <= 180;

    if (!isValid) {
      return SpeedEstimate(
        speedKmh: _smoothedSpeedKmh,
        accuracyMeters: accuracyMeters,
        hasFix: false,
        isMocked: position.isMocked,
        timestamp: timestamp,
      );
    }

    final platformSpeedKmh = _platformSpeedKmh(position);
    _fixes.addLast(
      _GpsFix(
        latitude: position.latitude,
        longitude: position.longitude,
        timestamp: timestamp,
        accuracyMeters: accuracyMeters ?? 50,
        platformSpeedKmh: platformSpeedKmh,
      ),
    );

    while (_fixes.length > 2 &&
        timestamp.difference(_fixes.first.timestamp) > window) {
      _fixes.removeFirst();
    }
    while (_fixes.length > 12) {
      _fixes.removeFirst();
    }

    final candidate = _candidateSpeedKmh();
    if (candidate != null) {
      _recentCandidates.add(candidate);
      if (_recentCandidates.length > 5) {
        _recentCandidates.removeAt(0);
      }
      final median = _median(_recentCandidates);
      _smoothedSpeedKmh = _smoothedSpeedKmh == 0
          ? median
          : _smoothedSpeedKmh * 0.55 + median * 0.45;
    }

    final hasFix = accuracyMeters != null && accuracyMeters <= 50;
    return SpeedEstimate(
      speedKmh: _smoothedSpeedKmh,
      accuracyMeters: accuracyMeters,
      hasFix: hasFix,
      isMocked: position.isMocked,
      timestamp: timestamp,
    );
  }

  void reset() {
    _fixes.clear();
    _recentCandidates.clear();
    _smoothedSpeedKmh = 0;
  }

  double? _platformSpeedKmh(Position position) {
    if (!position.hasSpeed ||
        !position.speed.isFinite ||
        position.speed < 0) {
      return null;
    }
    final kmh = position.speed * 3.6;
    return kmh <= maxPlausibleSpeedKmh ? kmh : null;
  }

  double? _candidateSpeedKmh() {
    final windowSpeed = _windowSpeedKmh();
    final platformSpeed = _fixes.isEmpty ? null : _fixes.last.platformSpeedKmh;

    if (windowSpeed != null) {
      if (windowSpeed == 0 &&
          platformSpeed != null &&
          platformSpeed > 8 &&
          platformSpeed <= 15) {
        return platformSpeed;
      }
      return windowSpeed;
    }
    return platformSpeed;
  }

  double? _windowSpeedKmh() {
    if (_fixes.length < 2) {
      return null;
    }

    final first = _fixes.first;
    final last = _fixes.last;
    final elapsedSeconds =
        last.timestamp.difference(first.timestamp).inMilliseconds / 1000;
    if (elapsedSeconds < 1) {
      return null;
    }

    final distanceMeters = Geolocator.distanceBetween(
      first.latitude,
      first.longitude,
      last.latitude,
      last.longitude,
    );
    final noiseMeters = math.max(
      2.5,
      (first.accuracyMeters + last.accuracyMeters) * 0.15,
    );
    if (distanceMeters < noiseMeters) {
      return 0;
    }

    final kmh = distanceMeters / elapsedSeconds * 3.6;
    return kmh <= maxPlausibleSpeedKmh ? kmh : null;
  }

  double _median(List<double> values) {
    final sorted = List<double>.of(values)..sort();
    final middle = sorted.length ~/ 2;
    if (sorted.length.isOdd) {
      return sorted[middle];
    }
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
}

class _GpsFix {
  const _GpsFix({
    required this.latitude,
    required this.longitude,
    required this.timestamp,
    required this.accuracyMeters,
    required this.platformSpeedKmh,
  });

  final double latitude;
  final double longitude;
  final DateTime timestamp;
  final double accuracyMeters;
  final double? platformSpeedKmh;
}
