import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:velocimetro_gps/speedometer_gauge.dart';

void main() {
  testWidgets('SpeedometerGauge shows speed and unit', (WidgetTester tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: SpeedometerGauge(speedKmh: 72.4),
        ),
      ),
    );

    expect(find.text('72.4'), findsOneWidget);
    expect(find.text('km/h'), findsOneWidget);
  });
}
