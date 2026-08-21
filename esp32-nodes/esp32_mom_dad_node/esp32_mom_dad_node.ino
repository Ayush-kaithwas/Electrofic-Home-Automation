/* ==============================================================================
 * ESP32 Node Firmware — Mom & Dad Room Switchboard
 * Room ID: mom_dad (Floor: 1st Floor)
 * 
 * Controlled Appliances:
 *   - md2: Smart Light / RGB (GPIO 25)
 *   - md4: Master Bed Fan (GPIO 26)
 *   - md5: Ambient Light (GPIO 27)
 *   - md6: Room Chandelier (GPIO 14)
 * 
 * Telemetry:
 *   - Wi-Fi RSSI signal strength & IP address
 *   - Temperature & Humidity readings
 * 
 * MQTT Topics:
 *   - Subscribes to: home/nodes/mom_dad/set
 *   - Subscribes to: home/nodes/all/scene (Broadcast scenes: ALL_OFF, NIGHT_MODE)
 *   - Publishes to:  home/nodes/mom_dad/telemetry
 * ============================================================================== */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ==============================================================================
// 1. NETWORK & MQTT CONFIGURATION
// ==============================================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";     // Enter your Home Wi-Fi SSID
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"; // Enter your Home Wi-Fi Password

const char* MQTT_SERVER   = "192.168.1.100";     // Raspberry Pi Gateway IP
const int   MQTT_PORT     = 1883;                 // Mosquitto Broker Port
const char* NODE_ID       = "mom_dad";            // Node identifier matching Firebase

// MQTT Topic Definitions
const char* TOPIC_SET       = "home/nodes/mom_dad/set";
const char* TOPIC_SCENE     = "home/nodes/all/scene";
const char* TOPIC_TELEMETRY = "home/nodes/mom_dad/telemetry";

// ==============================================================================
// 2. HARDWARE PIN DEFINITIONS
// ==============================================================================
#define PIN_SMART_LIGHT 25   // md2: Smart Light
#define PIN_FAN         26   // md4: Master Bed Fan
#define PIN_LIGHT       27   // md5: Ambient Light
#define PIN_CHANDELIER  14   // md6: Chandelier

#define RELAY_ON        LOW
#define RELAY_OFF       HIGH

// Appliance States
bool stateSmartLight = true;
bool stateFan        = false;
bool stateLight      = true;
bool stateChandelier = false;

// Environmental Data
float ambientTemp     = 24.2;
float ambientHumidity = 56.0;

// Timing Constants
unsigned long lastTelemetryMillis = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 8000;

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ==============================================================================
// 3. HARDWARE CONTROL HELPERS
// ==============================================================================
void applyRelayStates() {
  digitalWrite(PIN_SMART_LIGHT, stateSmartLight ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_FAN,         stateFan        ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_LIGHT,       stateLight      ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_CHANDELIER,  stateChandelier ? RELAY_ON : RELAY_OFF);
}

void initPins() {
  pinMode(PIN_SMART_LIGHT, OUTPUT);
  pinMode(PIN_FAN, OUTPUT);
  pinMode(PIN_LIGHT, OUTPUT);
  pinMode(PIN_CHANDELIER, OUTPUT);

  applyRelayStates();
}

// ==============================================================================
// 4. TELEMETRY PUBLISHER
// ==============================================================================
void publishTelemetry() {
  StaticJsonDocument<512> doc;
  doc["node_id"]   = NODE_ID;
  doc["room"]      = "Mom & Dad Room (1st Floor)";
  doc["ip"]        = WiFi.localIP().toString();
  doc["rssi"]      = WiFi.RSSI();
  doc["status"]    = "online";
  doc["uptime_s"]  = millis() / 1000;

  JsonObject relays = doc.createNestedObject("relays");
  relays["md2_smart_light"] = stateSmartLight;
  relays["md4_fan"]         = stateFan;
  relays["md5_light"]       = stateLight;
  relays["md6_chandelier"]  = stateChandelier;

  doc["temperature"] = ambientTemp;
  doc["humidity"]    = ambientHumidity;

  char buffer[512];
  size_t n = serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_TELEMETRY, buffer, n);
  Serial.print("[MQTT PUB] Telemetry: ");
  Serial.println(buffer);
}

// ==============================================================================
// 5. MQTT INCOMING COMMAND HANDLER
// ==============================================================================
void handleMqttMessage(char* topic, byte* payload, unsigned int length) {
  char message[512];
  if (length >= sizeof(message)) length = sizeof(message) - 1;
  memcpy(message, payload, length);
  message[length] = '\0';

  Serial.printf("[MQTT RECV] Topic: %s | Payload: %s\n", topic, message);

  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, message);

  if (String(topic) == TOPIC_SCENE) {
    const char* scene = doc["name"] | message;
    if (strcmp(scene, "all_off") == 0) {
      stateSmartLight = false;
      stateFan = false;
      stateLight = false;
      stateChandelier = false;
      Serial.println(">> Scene Executed: ALL_OFF");
    } else if (strcmp(scene, "night_mode") == 0) {
      stateSmartLight = true; // Night mode keeps smart ambient light ON
      stateLight = false;
      stateChandelier = false;
      Serial.println(">> Scene Executed: NIGHT_MODE");
    }
  } else if (!error) {
    if (doc.containsKey("md2") || (doc["name"] && strstr(doc["name"], "SMART"))) {
      stateSmartLight = doc.containsKey("md2") ? doc["md2"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc.containsKey("md4") || (doc["name"] && strstr(doc["name"], "FAN"))) {
      stateFan = doc.containsKey("md4") ? doc["md4"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc.containsKey("md5") || (doc["name"] && strstr(doc["name"], "LIGHT"))) {
      stateLight = doc.containsKey("md5") ? doc["md5"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc.containsKey("md6") || (doc["name"] && strstr(doc["name"], "CHANDELIER"))) {
      stateChandelier = doc.containsKey("md6") ? doc["md6"].as<bool>() : doc["state"].as<bool>();
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
    if (WiFi.status() != WL_CONNECTED) setupWiFi();
    Serial.print("[MQTT] Connecting to RPi Broker...");
    String clientId = String("ESP32_") + NODE_ID + "_" + String(random(0xffff), HEX);
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
  Serial.println("  ⚡ ELECTROFIC — ESP32 MOM & DAD ROOM NODE  ");
  Serial.println("=============================================");

  initPins();
  setupWiFi();

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(handleMqttMessage);
  mqttClient.setBufferSize(512);
}

void loop() {
  if (!mqttClient.connected()) reconnectMQTT();
  mqttClient.loop();

  unsigned long currentMillis = millis();
  if (currentMillis - lastTelemetryMillis >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMillis = currentMillis;
    publishTelemetry();
  }
}
