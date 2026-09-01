/* ==============================================================================
 * ESP32 Node Firmware — Ayush's Room Switchboard
 * Room ID: ayush (Floor: 2nd Floor)
 *
 * Controlled Appliances:
 *   - ay1: Main Fan with Speed Regulator (Relay on GPIO 25, PWM on GPIO 18)
 *   - ay2: Main Light (GPIO 26)
 *   - ay3: Night Bulb (GPIO 27)
 *   - ay5: Brown Fan (Secondary Fan, GPIO 14)
 *   - ay6: Centre Light Socket (GPIO 12)
 *
 * Telemetry:
 *   - Wi-Fi RSSI signal strength & IP address
 *   - Temperature & Humidity readings
 *
 * MQTT Topics:
 *   - Subscribes to: home/nodes/ayush/set
 *   - Subscribes to: home/nodes/all/scene (Broadcast scenes: ALL_OFF,
 * NIGHT_MODE)
 *   - Publishes to:  home/nodes/ayush/telemetry
 * ==============================================================================
 */

#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>

// ==============================================================================
// 1. NETWORK & MQTT CONFIGURATION
// ==============================================================================
const char *WIFI_SSID = "Voldemort";
const char *WIFI_PASSWORD = "password";

const char *MQTT_SERVER = "192.168.137.185"; // Raspberry Pi Gateway IP
const int MQTT_PORT = 1883;                  // Mosquitto Broker Port
const char *NODE_ID = "ayush"; // Node identifier matching Firebase

// MQTT Topic Definitions
const char *TOPIC_SET        = "home/nodes/ayush/set";
const char *TOPIC_SCENE      = "home/nodes/all/scene";
const char *TOPIC_TELEMETRY  = "home/nodes/ayush/telemetry";
const char *TOPIC_HEARTBEAT  = "home/nodes/ayush/heartbeat";

// ==============================================================================
// 2. HARDWARE PIN DEFINITIONS
// ==============================================================================
#define PIN_FAN_MAIN_RELAY 25 // ay1: Main Fan Power Relay
#define PIN_FAN_MAIN_PWM 18   // ay1: Main Fan Speed Regulator (PWM)
#define PIN_LIGHT_MAIN 26     // ay2: Main Light
#define PIN_NIGHT_BULB 27     // ay3: Night Bulb
#define PIN_BROWN_FAN 14      // ay5: Secondary Brown Fan
#define PIN_CENTRE_LIGHT 12   // ay6: Centre Light Socket

#define RELAY_ON LOW
#define RELAY_OFF HIGH

const int PWM_CHANNEL = 0;
const int PWM_FREQ = 5000;
const int PWM_RESOLUTION = 8;

// Appliance States
bool stateFanMain = false;
int fanMainSpeed = 5; // Level 1 - 5 (Default 5)
bool stateLightMain = false;
bool stateNightBulb = false;
bool stateBrownFan = false;
bool stateCentreLight = false;

// Environmental Data
float ambientTemp = 24.0;
float ambientHumidity = 54.0;

// Timing Constants
unsigned long lastTelemetryMillis  = 0;
unsigned long lastHeartbeatMillis  = 0;
const unsigned long TELEMETRY_INTERVAL_MS  = 8000;
const unsigned long HEARTBEAT_INTERVAL_MS  = 2000; // Heartbeat every 2s

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ==============================================================================
// 3. HARDWARE CONTROL HELPERS
// ==============================================================================
void applyFanMainSpeed(int speedLevel) {
  if (speedLevel < 1)
    speedLevel = 1;
  if (speedLevel > 5)
    speedLevel = 5;
  fanMainSpeed = speedLevel;

  int dutyCycle = map(speedLevel, 1, 5, 80, 255);
  if (!stateFanMain)
    dutyCycle = 0;

#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  ledcWrite(PIN_FAN_MAIN_PWM, dutyCycle);
#else
  ledcWrite(PWM_CHANNEL, dutyCycle);
#endif
  Serial.printf(
      "[REGULATOR] Ayush Main Fan Speed set to Level %d (Duty %d/255)\n",
      fanMainSpeed, dutyCycle);
}

void applyRelayStates() {
  digitalWrite(PIN_FAN_MAIN_RELAY, stateFanMain ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_LIGHT_MAIN, stateLightMain ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_NIGHT_BULB, stateNightBulb ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_BROWN_FAN, stateBrownFan ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_CENTRE_LIGHT, stateCentreLight ? RELAY_ON : RELAY_OFF);

  applyFanMainSpeed(fanMainSpeed);
}

void initPins() {
  pinMode(PIN_FAN_MAIN_RELAY, OUTPUT);
  pinMode(PIN_LIGHT_MAIN, OUTPUT);
  pinMode(PIN_NIGHT_BULB, OUTPUT);
  pinMode(PIN_BROWN_FAN, OUTPUT);
  pinMode(PIN_CENTRE_LIGHT, OUTPUT);

#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  ledcAttach(PIN_FAN_MAIN_PWM, PWM_FREQ, PWM_RESOLUTION);
#else
  ledcSetup(PWM_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(PIN_FAN_MAIN_PWM, PWM_CHANNEL);
#endif

  applyRelayStates();
}

// ==============================================================================
// 4. TELEMETRY & HEARTBEAT PUBLISHERS
// ==============================================================================

// Lightweight heartbeat — just proves the node is alive (2s interval)
void publishHeartbeat() {
  JsonDocument doc;
  doc["node_id"]  = NODE_ID;
  doc["ts_ms"]    = millis();
  doc["rssi"]     = WiFi.RSSI();

  char buffer[128];
  size_t n = serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_HEARTBEAT, buffer, n);
  Serial.println("[MQTT HEARTBEAT] ♥ sent");
}

// Full telemetry — relay states + environment (8s interval)
void publishTelemetry() {
  JsonDocument doc;
  doc["node_id"] = NODE_ID;
  doc["room"] = "Ayush Room (2nd Floor)";
  doc["mac"] = WiFi.macAddress();
  doc["rssi"] = WiFi.RSSI();
  doc["status"] = "online";
  doc["uptime_s"] = millis() / 1000;

  doc["relays"]["ay1_fan_main"] = stateFanMain;
  doc["relays"]["ay1_fan_speed"] = fanMainSpeed;
  doc["relays"]["ay2_light_main"] = stateLightMain;
  doc["relays"]["ay3_night_bulb"] = stateNightBulb;
  doc["relays"]["ay5_brown_fan"] = stateBrownFan;
  doc["relays"]["ay6_centre_light"] = stateCentreLight;

  doc["temperature"] = ambientTemp;
  doc["humidity"] = ambientHumidity;

  char buffer[512];
  size_t n = serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_TELEMETRY, buffer, n);
  Serial.print("[MQTT PUB] Telemetry: ");
  Serial.println(buffer);
}

// ==============================================================================
// 5. MQTT INCOMING COMMAND HANDLER
// ==============================================================================
void handleMqttMessage(char *topic, byte *payload, unsigned int length) {
  char message[512];
  if (length >= sizeof(message))
    length = sizeof(message) - 1;
  memcpy(message, payload, length);
  message[length] = '\0';

  Serial.printf("[MQTT RECV] Topic: %s | Payload: %s\n", topic, message);

  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, message);

  if (String(topic) == TOPIC_SCENE) {
    const char *scene = doc["name"] | message;
    if (strcmp(scene, "all_off") == 0) {
      stateFanMain = false;
      stateLightMain = false;
      stateNightBulb = false;
      stateBrownFan = false;
      stateCentreLight = false;
      Serial.println(">> Scene Executed: ALL_OFF");
    } else if (strcmp(scene, "night_mode") == 0) {
      stateNightBulb = true; // Night lamp ON
      stateLightMain = false;
      stateBrownFan = false;
      stateCentreLight = false;
      Serial.println(">> Scene Executed: NIGHT_MODE");
    }
  } else if (!error) {
    const char* nameStr = doc["name"] | "";
    if (doc["ay1"].is<bool>() || (strstr(nameStr, "FAN") && !strstr(nameStr, "BROWN"))) {
      stateFanMain = doc["ay1"].is<bool>() ? doc["ay1"].as<bool>() : doc["state"].as<bool>();
      if (doc["speed"].is<int>()) {
        fanMainSpeed = doc["speed"].as<int>();
      }
    }
    if (doc["ay2"].is<bool>() || strstr(nameStr, "MAIN")) {
      stateLightMain = doc["ay2"].is<bool>() ? doc["ay2"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc["ay3"].is<bool>() || strstr(nameStr, "NIGHT")) {
      stateNightBulb = doc["ay3"].is<bool>() ? doc["ay3"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc["ay5"].is<bool>() || strstr(nameStr, "BROWN")) {
      stateBrownFan = doc["ay5"].is<bool>() ? doc["ay5"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc["ay6"].is<bool>() || strstr(nameStr, "CENTRE")) {
      stateCentreLight = doc["ay6"].is<bool>() ? doc["ay6"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc["speed"].is<int>()) {
      fanMainSpeed = doc["speed"].as<int>();
    }
  }

  applyRelayStates();
  publishTelemetry();
}

// ==============================================================================
// 6. WI-FI & MQTT CONNECTION MANAGERS
// ==============================================================================
void setupWiFi() {
  delay(10);
  Serial.print("\nConnecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[Wi-Fi] Connected!");
    Serial.print("[Wi-Fi] IP: ");
    Serial.println(WiFi.localIP());
  }
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    if (WiFi.status() != WL_CONNECTED)
      setupWiFi();
    Serial.print("[MQTT] Connecting to RPi Broker...");
    String clientId =
        String("ESP32_") + NODE_ID + "_" + String(random(0xffff), HEX);
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" Connected!");
      mqttClient.subscribe(TOPIC_SET);
      mqttClient.subscribe(TOPIC_SCENE);
      publishTelemetry();
    } else {
      Serial.printf(" Failed (rc=%d). Retrying in 5s...\n", mqttClient.state());
      delay(5000);
    }
  }
}

// ==============================================================================
// 7. SETUP & MAIN LOOP
// ==============================================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=============================================");
  Serial.println("   ⚡ ELECTROFIC — ESP32 AYUSH ROOM NODE     ");
  Serial.println("=============================================");

  initPins();
  setupWiFi();

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(handleMqttMessage);
  mqttClient.setBufferSize(512);
}

void loop() {
  if (!mqttClient.connected())
    reconnectMQTT();
  mqttClient.loop();

  unsigned long currentMillis = millis();

  // Heartbeat every 2 seconds (lightweight — just signals the node is alive)
  if (currentMillis - lastHeartbeatMillis >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeatMillis = currentMillis;
    publishHeartbeat();
  }

  // Full telemetry every 8 seconds (relay states + environment data)
  if (currentMillis - lastTelemetryMillis >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMillis = currentMillis;
    publishTelemetry();
  }
}
