import 'dart:math' as math;

import 'package:material_ui/material_ui.dart';

class SpeedometerGauge extends StatelessWidget {
  const SpeedometerGauge({
    super.key,
    required this.speedKmh,
    this.maxSpeedKmh = 240,
    this.active = true,
  });

  final double speedKmh;
  final double maxSpeedKmh;
  final bool active;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final side = math.min(constraints.maxWidth, constraints.maxHeight) * 0.92;
        return Center(
          child: SizedBox(
            width: side,
            height: side,
            child: CustomPaint(
              painter: _GaugePainter(
                progress: (speedKmh / maxSpeedKmh).clamp(0.0, 1.0),
                speedKmh: speedKmh,
                active: active,
              ),
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      child: Text(
                        speedKmh.toStringAsFixed(1),
                        style: TextStyle(
                          color: active ? Colors.white : Colors.white38,
                          fontSize: 72,
                          fontWeight: FontWeight.w800,
                          height: 1,
                        ),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'km/h',
                      style: TextStyle(
                        color: active
                            ? Colors.white.withValues(alpha: 0.72)
                            : Colors.white38,
                        fontSize: 22,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _GaugePainter extends CustomPainter {
  _GaugePainter({
    required this.progress,
    required this.speedKmh,
    required this.active,
  });

  final double progress;
  final double speedKmh;
  final bool active;

  static const double _maxSpeed = 240;
  static const double _startAngle = math.pi * 0.75;
  static const double _sweepAngle = math.pi * 1.5;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = math.min(size.width, size.height) / 2 - 18;
    final rect = Rect.fromCircle(center: center, radius: radius);
    final trackPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 14
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withValues(alpha: active ? 0.12 : 0.08);

    canvas.drawArc(rect, _startAngle, _sweepAngle, false, trackPaint);

    if (progress > 0) {
      final progressPaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeWidth = 14
        ..strokeCap = StrokeCap.round
        ..shader = SweepGradient(
          startAngle: _startAngle,
          endAngle: _startAngle + _sweepAngle,
          colors: const [
            Color(0xFF34D399),
            Color(0xFFFBBF24),
            Color(0xFFF97316),
            Color(0xFFEF4444),
          ],
          stops: const [0, 0.45, 0.75, 1],
        ).createShader(rect);
      canvas.drawArc(
        rect,
        _startAngle,
        _sweepAngle * progress,
        false,
        progressPaint,
      );
    }

    _drawTicks(canvas, center, radius);
    _drawLabels(canvas, center, radius);
  }

  void _drawTicks(Canvas canvas, Offset center, double radius) {
    final tickPaint = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..color = Colors.white.withValues(alpha: active ? 0.45 : 0.25);

    for (var i = 0; i <= 12; i++) {
      final value = i * (_maxSpeed / 12);
      final angle = _angleFor(value);
      final outer = _point(center, radius - 8, angle);
      final inner = _point(center, radius - (i % 3 == 0 ? 18 : 13), angle);
      canvas.drawLine(outer, inner, tickPaint);
    }
  }

  void _drawLabels(Canvas canvas, Offset center, double radius) {
    const values = [0, 60, 120, 180, 240];
    for (final value in values) {
      final angle = _angleFor(value.toDouble());
      final offset = _point(center, radius - 38, angle);
      final painter = TextPainter(
        text: TextSpan(
          text: '$value',
          style: TextStyle(
            color: Colors.white.withValues(alpha: active ? 0.62 : 0.35),
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      painter.paint(canvas, offset - Offset(painter.width / 2, painter.height / 2));
    }
  }

  double _angleFor(double speedKmh) {
    final fraction = (speedKmh / _maxSpeed).clamp(0.0, 1.0);
    return _startAngle + _sweepAngle * fraction;
  }

  Offset _point(Offset center, double radius, double angle) {
    return Offset(
      center.dx + radius * math.cos(angle),
      center.dy + radius * math.sin(angle),
    );
  }

  @override
  bool shouldRepaint(covariant _GaugePainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.speedKmh != speedKmh ||
        oldDelegate.active != active;
  }
}
