/* ==============================================================================
 * ESP32 Node Firmware — Ground Floor Hall Switchboard
 * Room ID: hall (Floor: Ground Floor)
 *
 * Controlled Appliances:
 *   - h1: Main Hall Fan (GPIO 25)
 *   - h2: Hall Main Light (GPIO 26)
 *   - h4: Decorative Chandelier (GPIO 27)
 *
 * Target Board in Arduino IDE: "ESP32 Dev Module" (or DOIT ESP32 DEVKIT V1)
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
const char *NODE_ID = "hall"; // Node identifier matching Firebase

// MQTT Topic Definitions
const char *TOPIC_SET        = "home/nodes/hall/set";
const char *TOPIC_SCENE      = "home/nodes/all/scene";
const char *TOPIC_TELEMETRY  = "home/nodes/hall/telemetry";
const char *TOPIC_HEARTBEAT  = "home/nodes/hall/heartbeat";

// ==============================================================================
// 2. HARDWARE PIN DEFINITIONS
// ==============================================================================
#define PIN_FAN 25        // h1: Main Hall Fan
#define PIN_LIGHT 26      // h2: Main Light
#define PIN_CHANDELIER 27 // h4: Decorative Chandelier

#define RELAY_ON LOW
#define RELAY_OFF HIGH

// Relay States
bool stateFan = false;
bool stateLight = false;
bool stateChandelier = false;

// Simulated / Sensor Ambient Temp
float ambientTemp = 24.5;
float ambientHumidity = 58.0;

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
void applyRelayStates() {
  digitalWrite(PIN_FAN, stateFan ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_LIGHT, stateLight ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_CHANDELIER, stateChandelier ? RELAY_ON : RELAY_OFF);
}

void initPins() {
  pinMode(PIN_FAN, OUTPUT);
  pinMode(PIN_LIGHT, OUTPUT);
  pinMode(PIN_CHANDELIER, OUTPUT);

  applyRelayStates();
}

// ==============================================================================
// 4. TELEMETRY & HEARTBEAT PUBLISHERS (Compatible with ArduinoJson v6 & v7)
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
  doc["room"] = "Hall (Ground Floor)";
  doc["mac"] = WiFi.macAddress();
  doc["rssi"] = WiFi.RSSI();
  doc["status"] = "online";
  doc["uptime_s"] = millis() / 1000;

  // Relay states
  doc["relays"]["h1_fan"] = stateFan;
  doc["relays"]["h2_light"] = stateLight;
  doc["relays"]["h4_chandelier"] = stateChandelier;

  // Temperature / Environmental telemetry
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

  // Parse incoming JSON command
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, message);

  if (String(topic) == TOPIC_SCENE) {
    // Broadcast Scene Trigger
    const char *scene = doc["name"] | message;
    if (strcmp(scene, "all_off") == 0) {
      stateFan = false;
      stateLight = false;
      stateChandelier = false;
      Serial.println(">> Scene Executed: ALL_OFF");
    } else if (strcmp(scene, "night_mode") == 0) {
      stateLight = false;
      stateChandelier = false;
      Serial.println(">> Scene Executed: NIGHT_MODE");
    }
  } else if (!error) {
    const char* nameStr = doc["name"] | "";
    if (doc["h1"].is<bool>() || strstr(nameStr, "FAN")) {
      stateFan = doc["h1"].is<bool>() ? doc["h1"].as<bool>() : doc["state"].as<bool>();
      Serial.printf(">> Main Fan -> %s\n", stateFan ? "ON" : "OFF");
    }
    if (doc["h2"].is<bool>() || strstr(nameStr, "LIGHT")) {
      stateLight = doc["h2"].is<bool>() ? doc["h2"].as<bool>() : doc["state"].as<bool>();
      Serial.printf(">> Main Light -> %s\n", stateLight ? "ON" : "OFF");
    }
    if (doc["h4"].is<bool>() || strstr(nameStr, "CHANDELIER")) {
      stateChandelier = doc["h4"].is<bool>() ? doc["h4"].as<bool>() : doc["state"].as<bool>();
      Serial.printf(">> Chandelier -> %s\n", stateChandelier ? "ON" : "OFF");
    }
  } else {
    // Simple text fallback: "h1_on", "h1_off", "h2_on", etc.
    String cmd = String(message);
    cmd.toLowerCase();
    if (cmd == "h1_on" || cmd == "fan_on")
      stateFan = true;
    if (cmd == "h1_off" || cmd == "fan_off")
      stateFan = false;
    if (cmd == "h2_on" || cmd == "light_on")
      stateLight = true;
    if (cmd == "h2_off" || cmd == "light_off")
      stateLight = false;
    if (cmd == "h4_on" || cmd == "chandelier_on")
      stateChandelier = true;
    if (cmd == "h4_off" || cmd == "chandelier_off")
      stateChandelier = false;
  }

  // Apply new physical states to relays immediately
  applyRelayStates();

  // Send immediate feedback telemetry to RPi & Firebase
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
    Serial.print("[Wi-Fi] IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[Wi-Fi] Connection Failed. Retrying in loop...");
  }
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    if (WiFi.status() != WL_CONNECTED) {
      setupWiFi();
    }
    Serial.print("[MQTT] Connecting to RPi Broker (");
    Serial.print(MQTT_SERVER);
    Serial.print(")...");

    String clientId =
        String("ESP32_") + NODE_ID + "_" + String(random(0xffff), HEX);
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println(" Connected!");
      // Subscribe to node commands and global scenes
      mqttClient.subscribe(TOPIC_SET);
      mqttClient.subscribe(TOPIC_SCENE);
      Serial.printf("[MQTT] Subscribed to: %s and %s\n", TOPIC_SET,
                    TOPIC_SCENE);
      // Publish initial state
      publishTelemetry();
    } else {
      Serial.print(" Failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(". Retrying in 5 seconds...");
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
  Serial.println("   ⚡ ELECTROFIC — ESP32 HALL NODE (GROUND)  ");
  Serial.println("=============================================");

  initPins();
  setupWiFi();

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(handleMqttMessage);
  mqttClient.setBufferSize(512);
}

void loop() {
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
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
