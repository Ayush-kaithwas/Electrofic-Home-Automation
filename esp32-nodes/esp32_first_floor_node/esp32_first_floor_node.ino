/* ==============================================================================
 * ESP32 Node Firmware — First Floor Room Switchboard
 * Room ID: first_floor (Floor: 1st Floor)
 *
 * Controlled Appliances:
 *   - f2: Night Bulb (GPIO 25)
 *   - f4: Fan with Speed Regulator (Relay on GPIO 26, PWM on GPIO 18)
 *   - f5: Room Main Light (GPIO 27)
 *   - f6: Room Chandelier (GPIO 14)
 *
 * Telemetry:
 *   - Wi-Fi RSSI signal strength & IP address
 *   - Temperature & Humidity readings
 *
 * MQTT Topics:
 *   - Subscribes to: home/nodes/first_floor/set
 *   - Subscribes to: home/nodes/all/scene (Broadcast scenes: ALL_OFF,
 * NIGHT_MODE)
 *   - Publishes to:  home/nodes/first_floor/telemetry
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
const char *NODE_ID = "first_floor"; // Node identifier matching Firebase

// MQTT Topic Definitions
const char *TOPIC_SET        = "home/nodes/first_floor/set";
const char *TOPIC_SCENE      = "home/nodes/all/scene";
const char *TOPIC_TELEMETRY  = "home/nodes/first_floor/telemetry";
const char *TOPIC_HEARTBEAT  = "home/nodes/first_floor/heartbeat";

// ==============================================================================
// 2. HARDWARE PIN DEFINITIONS
// ==============================================================================
#define PIN_NIGHT_BULB 25 // f2: Night Bulb
#define PIN_FAN_RELAY 26  // f4: Fan Power Relay
#define PIN_FAN_PWM 18    // f4: Fan Speed Regulator (PWM channel)
#define PIN_LIGHT 27      // f5: Main Light
#define PIN_CHANDELIER 14 // f6: Chandelier

#define RELAY_ON LOW
#define RELAY_OFF HIGH

// PWM Channel configuration for Fan Speed (Levels 1 - 5)
const int PWM_CHANNEL = 0;
const int PWM_FREQ = 5000;    // 5 kHz
const int PWM_RESOLUTION = 8; // 8-bit (0 - 255)

// Appliance States
bool stateNightBulb = true;
bool stateFan = true;
int fanSpeed = 3; // Level 1 to 5
bool stateLight = false;
bool stateChandelier = false;

// Environmental Data
float ambientTemp = 25.1;
float ambientHumidity = 55.0;

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
void applyFanSpeed(int speedLevel) {
  if (speedLevel < 1)
    speedLevel = 1;
  if (speedLevel > 5)
    speedLevel = 5;
  fanSpeed = speedLevel;

  // Convert Speed 1-5 to PWM Duty Cycle (80 to 255)
  int dutyCycle = map(speedLevel, 1, 5, 80, 255);
  if (!stateFan)
    dutyCycle = 0;

#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  ledcWrite(PIN_FAN_PWM, dutyCycle);
#else
  ledcWrite(PWM_CHANNEL, dutyCycle);
#endif
  Serial.printf("[FAN] Speed set to Level %d (PWM Duty: %d/255)\n", fanSpeed,
                dutyCycle);
}

void applyRelayStates() {
  digitalWrite(PIN_NIGHT_BULB, stateNightBulb ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_FAN_RELAY, stateFan ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_LIGHT, stateLight ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_CHANDELIER, stateChandelier ? RELAY_ON : RELAY_OFF);

  applyFanSpeed(fanSpeed);
}

void initPins() {
  pinMode(PIN_NIGHT_BULB, OUTPUT);
  pinMode(PIN_FAN_RELAY, OUTPUT);
  pinMode(PIN_LIGHT, OUTPUT);
  pinMode(PIN_CHANDELIER, OUTPUT);

#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  ledcAttach(PIN_FAN_PWM, PWM_FREQ, PWM_RESOLUTION);
#else
  ledcSetup(PWM_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(PIN_FAN_PWM, PWM_CHANNEL);
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
  doc["room"] = "First Floor Room";
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();
  doc["status"] = "online";
  doc["uptime_s"] = millis() / 1000;

  doc["relays"]["f2_night_bulb"] = stateNightBulb;
  doc["relays"]["f4_fan"] = stateFan;
  doc["relays"]["f4_fan_speed"] = fanSpeed;
  doc["relays"]["f5_light"] = stateLight;
  doc["relays"]["f6_chandelier"] = stateChandelier;

  doc["temperature"] = ambientTemp;
  doc["humidity"] = ambientHumidity;

  char buffer[512];
  size_t n = serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_TELEMETRY, buffer, n);
  Serial.print("[MQTT PUB] Telemetry sent: ");
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
      stateNightBulb = false;
      stateFan = false;
      stateLight = false;
      stateChandelier = false;
      Serial.println(">> Scene Executed: ALL_OFF");
    } else if (strcmp(scene, "night_mode") == 0) {
      stateNightBulb = true; // Night mode keeps night bulb ON
      stateLight = false;
      stateChandelier = false;
      Serial.println(">> Scene Executed: NIGHT_MODE");
    }
  } else if (!error) {
    const char* nameStr = doc["name"] | "";
    if (doc["f2"].is<bool>() || strstr(nameStr, "NIGHT")) {
      stateNightBulb = doc["f2"].is<bool>() ? doc["f2"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc["f4"].is<bool>() || strstr(nameStr, "FAN")) {
      stateFan = doc["f4"].is<bool>() ? doc["f4"].as<bool>() : doc["state"].as<bool>();
      if (doc["speed"].is<int>()) {
        fanSpeed = doc["speed"].as<int>();
      }
    }
    if (doc["f5"].is<bool>() || strstr(nameStr, "LIGHT")) {
      stateLight = doc["f5"].is<bool>() ? doc["f5"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc["f6"].is<bool>() || strstr(nameStr, "CHANDELIER")) {
      stateChandelier = doc["f6"].is<bool>() ? doc["f6"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc["speed"].is<int>()) {
      fanSpeed = doc["speed"].as<int>();
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
  Serial.println(" ⚡ ELECTROFIC — ESP32 FIRST FLOOR ROOM NODE  ");
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
