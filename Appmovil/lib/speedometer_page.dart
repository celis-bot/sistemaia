import 'dart:async';

import 'package:geolocator/geolocator.dart';
import 'package:material_ui/material_ui.dart';

import 'gps_speed_estimator.dart';
import 'speedometer_gauge.dart';

enum _GpsStatus {
  checking,
  active,
  weakSignal,
  noSignal,
  serviceDisabled,
  permissionDenied,
  permissionDeniedForever,
  error,
}

class SpeedometerPage extends StatefulWidget {
  const SpeedometerPage({super.key});

  @override
  State<SpeedometerPage> createState() => _SpeedometerPageState();
}

class _SpeedometerPageState extends State<SpeedometerPage>
    with WidgetsBindingObserver {
  final GpsSpeedEstimator _estimator = GpsSpeedEstimator();

  StreamSubscription<Position>? _positionSubscription;
  StreamSubscription<ServiceStatus>? _serviceStatusSubscription;
  Timer? _stalenessTimer;

  SpeedEstimate? _estimate;
  _GpsStatus _status = _GpsStatus.checking;
  String? _errorMessage;
  double _maxSpeedKmh = 0;
  DateTime? _lastUpdate;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _serviceStatusSubscription =
        Geolocator.getServiceStatusStream().listen(_onServiceStatus);
    _stalenessTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      _checkStaleness();
    });
    _initialize();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _positionSubscription?.cancel();
    _serviceStatusSubscription?.cancel();
    _stalenessTimer?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _initialize();
    }
  }

  Future<void> _initialize() async {
    _setStatus(_GpsStatus.checking, clearError: true);
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        _setStatus(_GpsStatus.serviceDisabled);
        return;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.deniedForever) {
        _setStatus(_GpsStatus.permissionDeniedForever);
        return;
      }
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.unableToDetermine) {
        _setStatus(_GpsStatus.permissionDenied);
        return;
      }

      _startListening();
    } on PermissionDefinitionsNotFoundException catch (error) {
      _setStatus(_GpsStatus.error, errorMessage: error.message);
    } on PermissionRequestInProgressException {
      _setStatus(_GpsStatus.checking);
    } catch (error) {
      _setStatus(_GpsStatus.error, errorMessage: error.toString());
    }
  }

  void _startListening() {
    _positionSubscription?.cancel();
    _positionSubscription = Geolocator.getPositionStream(
      locationSettings: AndroidSettings(
        accuracy: LocationAccuracy.best,
        distanceFilter: 0,
        intervalDuration: const Duration(seconds: 1),
      ),
    ).listen(
      _onPosition,
      onError: _onPositionError,
      cancelOnError: false,
    );
    _setStatus(_GpsStatus.noSignal);
  }

  void _onPosition(Position position) {
    final estimate = _estimator.addPosition(position);
    if (!mounted) {
      return;
    }

    setState(() {
      _estimate = estimate;
      _lastUpdate = DateTime.now();
      _maxSpeedKmh = mathMax(_maxSpeedKmh, estimate.speedKmh);
      final accuracy = estimate.accuracyMeters;
      if (!estimate.hasFix || accuracy == null || accuracy > 50) {
        _status = _GpsStatus.noSignal;
      } else if (accuracy > 25) {
        _status = _GpsStatus.weakSignal;
      } else {
        _status = _GpsStatus.active;
      }
    });
  }

  void _onPositionError(Object error) {
    if (!mounted) {
      return;
    }

    if (error is LocationServiceDisabledException) {
      _setStatus(_GpsStatus.serviceDisabled);
      return;
    }
    if (error is PermissionDeniedException) {
      _setStatus(_GpsStatus.permissionDenied);
      return;
    }
    if (error is AlreadySubscribedException) {
      _startListening();
      return;
    }

    _setStatus(_GpsStatus.error, errorMessage: error.toString());
  }

  void _onServiceStatus(ServiceStatus status) {
    if (!mounted) {
      return;
    }
    if (status == ServiceStatus.disabled) {
      _positionSubscription?.cancel();
      _positionSubscription = null;
      _estimator.reset();
      _setStatus(_GpsStatus.serviceDisabled);
    } else if (_status == _GpsStatus.serviceDisabled) {
      _initialize();
    }
  }

  void _checkStaleness() {
    final lastUpdate = _lastUpdate;
    if (lastUpdate == null || !mounted) {
      return;
    }
    if (DateTime.now().difference(lastUpdate) > const Duration(seconds: 5)) {
      _estimator.reset();
      setState(() {
        _estimate = null;
        _status = _GpsStatus.noSignal;
      });
    }
  }

  void _setStatus(_GpsStatus status, {String? errorMessage, bool clearError = false}) {
    if (!mounted) {
      return;
    }
    setState(() {
      _status = status;
      if (clearError || errorMessage != null) {
        _errorMessage = errorMessage;
      }
    });
  }

  double mathMax(double a, double b) => a > b ? a : b;

  @override
  Widget build(BuildContext context) {
    final estimate = _estimate;
    final speed = estimate?.speedKmh ?? 0;
    final isActive = _status == _GpsStatus.active || _status == _GpsStatus.weakSignal;

    return Scaffold(
      backgroundColor: const Color(0xFF0B1020),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Velocímetro GPS'),
        centerTitle: true,
      ),
      body: SafeArea(
        child: _status == _GpsStatus.checking
            ? const Center(child: CircularProgressIndicator())
            : Column(
                children: [
                  Expanded(
                    child: SpeedometerGauge(
                      speedKmh: speed,
                      active: isActive,
                    ),
                  ),
                  _StatusPanel(
                    status: _status,
                    estimate: estimate,
                    maxSpeedKmh: _maxSpeedKmh,
                    errorMessage: _errorMessage,
                    onRetry: _initialize,
                    onOpenLocationSettings: () => Geolocator.openLocationSettings(),
                    onOpenAppSettings: () => Geolocator.openAppSettings(),
                  ),
                ],
              ),
      ),
    );
  }
}

class _StatusPanel extends StatelessWidget {
  const _StatusPanel({
    required this.status,
    required this.estimate,
    required this.maxSpeedKmh,
    required this.errorMessage,
    required this.onRetry,
    required this.onOpenLocationSettings,
    required this.onOpenAppSettings,
  });

  final _GpsStatus status;
  final SpeedEstimate? estimate;
  final double maxSpeedKmh;
  final String? errorMessage;
  final VoidCallback onRetry;
  final VoidCallback onOpenLocationSettings;
  final VoidCallback onOpenAppSettings;

  @override
  Widget build(BuildContext context) {
    final accuracy = estimate?.accuracyMeters;
    final isMocked = estimate?.isMocked ?? false;

    return Container(
      width: double.infinity,
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _StatusMessage(status: status, accuracy: accuracy, isMocked: isMocked),
          if (accuracy != null && status != _GpsStatus.serviceDisabled) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _InfoTile(
                    icon: Icons.gps_fixed,
                    label: 'Precisión',
                    value: '±${accuracy.toStringAsFixed(0)} m',
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _InfoTile(
                    icon: Icons.speed,
                    label: 'Máxima',
                    value: '${maxSpeedKmh.toStringAsFixed(0)} km/h',
                  ),
                ),
              ],
            ),
          ],
          if (errorMessage != null && status == _GpsStatus.error) ...[
            const SizedBox(height: 10),
            Text(
              errorMessage!,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(color: Colors.redAccent, fontSize: 12),
            ),
          ],
          const SizedBox(height: 14),
          _buildActions(context),
        ],
      ),
    );
  }

  Widget _buildActions(BuildContext context) {
    switch (status) {
      case _GpsStatus.serviceDisabled:
        return Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                onPressed: onOpenLocationSettings,
                icon: const Icon(Icons.location_on),
                label: const Text('Activar ubicación'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh),
                label: const Text('Reintentar'),
              ),
            ),
          ],
        );
      case _GpsStatus.permissionDeniedForever:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FilledButton.icon(
              onPressed: onOpenAppSettings,
              icon: const Icon(Icons.settings),
              label: const Text('Abrir ajustes de la app'),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: const Text('Reintentar'),
            ),
          ],
        );
      case _GpsStatus.permissionDenied:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FilledButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.location_on),
              label: const Text('Conceder permiso'),
            ),
            const SizedBox(height: 10),
            OutlinedButton.icon(
              onPressed: onOpenAppSettings,
              icon: const Icon(Icons.settings),
              label: const Text('Abrir ajustes'),
            ),
          ],
        );
      case _GpsStatus.error:
      case _GpsStatus.noSignal:
      case _GpsStatus.weakSignal:
        return OutlinedButton.icon(
          onPressed: onRetry,
          icon: const Icon(Icons.refresh),
          label: const Text('Reintentar'),
        );
      case _GpsStatus.active:
      case _GpsStatus.checking:
        return const SizedBox.shrink();
    }
  }
}

class _StatusMessage extends StatelessWidget {
  const _StatusMessage({
    required this.status,
    required this.accuracy,
    required this.isMocked,
  });

  final _GpsStatus status;
  final double? accuracy;
  final bool isMocked;

  @override
  Widget build(BuildContext context) {
    final (icon, color, text) = switch (status) {
      _GpsStatus.checking => (
          Icons.hourglass_top,
          Colors.white70,
          'Preparando GPS…',
        ),
      _GpsStatus.active => (
          Icons.gps_fixed,
          const Color(0xFF34D399),
          'GPS activo',
        ),
      _GpsStatus.weakSignal => (
          Icons.gps_not_fixed,
          const Color(0xFFFBBF24),
          'Señal GPS débil',
        ),
      _GpsStatus.noSignal => (
          Icons.location_searching,
          Colors.white70,
          'Buscando señal GPS…',
        ),
      _GpsStatus.serviceDisabled => (
          Icons.location_off,
          Colors.redAccent,
          'Servicios de ubicación desactivados',
        ),
      _GpsStatus.permissionDenied => (
          Icons.lock_outline,
          Colors.redAccent,
          'Permiso de ubicación requerido',
        ),
      _GpsStatus.permissionDeniedForever => (
          Icons.lock,
          Colors.redAccent,
          'Permiso de ubicación denegado permanentemente',
        ),
      _GpsStatus.error => (
          Icons.error_outline,
          Colors.redAccent,
          'No se pudo iniciar el GPS',
        ),
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, color: color, size: 22),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                text,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
        if (isMocked) ...[
          const SizedBox(height: 8),
          const Row(
            children: [
              Icon(Icons.science_outlined, color: Colors.orangeAccent, size: 18),
              SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Ubicación simulada detectada',
                  style: TextStyle(color: Colors.orangeAccent, fontSize: 12),
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(icon, color: Colors.white54, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: const TextStyle(color: Colors.white54, fontSize: 11),
                ),
                Text(
                  value,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
