/* ==============================================================================
 * ESP32 Node Firmware — Harry's Room Switchboard
 * Room ID: harry (Floor: 2nd Floor)
 * 
 * Controlled Appliances:
 *   - hr3: Night Bulb (GPIO 25)
 *   - hr4: Ceiling Fan (GPIO 26)
 *   - hr5: Study / Room Light (GPIO 27)
 *   - hr6: Fan Regulator (PWM on GPIO 18, Speed 1-5)
 * 
 * Telemetry:
 *   - Wi-Fi RSSI signal strength & IP address
 *   - Temperature & Humidity readings
 * 
 * MQTT Topics:
 *   - Subscribes to: home/nodes/harry/set
 *   - Subscribes to: home/nodes/all/scene (Broadcast scenes: ALL_OFF, NIGHT_MODE)
 *   - Publishes to:  home/nodes/harry/telemetry
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
const char* NODE_ID       = "harry";              // Node identifier matching Firebase

// MQTT Topic Definitions
const char* TOPIC_SET       = "home/nodes/harry/set";
const char* TOPIC_SCENE     = "home/nodes/all/scene";
const char* TOPIC_TELEMETRY = "home/nodes/harry/telemetry";

// ==============================================================================
// 2. HARDWARE PIN DEFINITIONS
// ==============================================================================
#define PIN_NIGHT_BULB  25   // hr3: Night Bulb
#define PIN_FAN_RELAY   26   // hr4: Fan Power Relay
#define PIN_STUDY_LIGHT 27   // hr5: Study Light
#define PIN_REGULATOR   18   // hr6: Fan Speed Regulator (PWM)

#define RELAY_ON        LOW
#define RELAY_OFF       HIGH

const int PWM_CHANNEL    = 0;
const int PWM_FREQ       = 5000;
const int PWM_RESOLUTION = 8;

// Appliance States
bool stateNightBulb  = true;
bool stateFan        = true;
bool stateStudyLight = true;
int  fanSpeed        = 4;     // Level 1 - 5 (Default 4)

// Environmental Data
float ambientTemp     = 23.8;
float ambientHumidity = 60.0;

// Timing Constants
unsigned long lastTelemetryMillis = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 8000;

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ==============================================================================
// 3. HARDWARE CONTROL HELPERS
// ==============================================================================
void applyFanSpeed(int speedLevel) {
  if (speedLevel < 1) speedLevel = 1;
  if (speedLevel > 5) speedLevel = 5;
  fanSpeed = speedLevel;

  int dutyCycle = map(speedLevel, 1, 5, 80, 255);
  if (!stateFan) dutyCycle = 0;

  ledcWrite(PWM_CHANNEL, dutyCycle);
  Serial.printf("[REGULATOR] Harry Fan Speed set to Level %d (Duty %d/255)\n", fanSpeed, dutyCycle);
}

void applyRelayStates() {
  digitalWrite(PIN_NIGHT_BULB,  stateNightBulb  ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_FAN_RELAY,   stateFan        ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_STUDY_LIGHT, stateStudyLight ? RELAY_ON : RELAY_OFF);

  applyFanSpeed(fanSpeed);
}

void initPins() {
  pinMode(PIN_NIGHT_BULB, OUTPUT);
  pinMode(PIN_FAN_RELAY, OUTPUT);
  pinMode(PIN_STUDY_LIGHT, OUTPUT);

  ledcSetup(PWM_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(PIN_REGULATOR, PWM_CHANNEL);

  applyRelayStates();
}

// ==============================================================================
// 4. TELEMETRY PUBLISHER
// ==============================================================================
void publishTelemetry() {
  StaticJsonDocument<512> doc;
  doc["node_id"]   = NODE_ID;
  doc["room"]      = "Harry Room (2nd Floor)";
  doc["ip"]        = WiFi.localIP().toString();
  doc["rssi"]      = WiFi.RSSI();
  doc["status"]    = "online";
  doc["uptime_s"]  = millis() / 1000;

  JsonObject relays = doc.createNestedObject("relays");
  relays["hr3_night_bulb"]  = stateNightBulb;
  relays["hr4_fan"]         = stateFan;
  relays["hr5_study_light"] = stateStudyLight;
  relays["hr6_fan_speed"]   = fanSpeed;

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
      stateNightBulb = false;
      stateFan = false;
      stateStudyLight = false;
      Serial.println(">> Scene Executed: ALL_OFF");
    } else if (strcmp(scene, "night_mode") == 0) {
      stateNightBulb = true;
      stateStudyLight = false;
      Serial.println(">> Scene Executed: NIGHT_MODE");
    }
  } else if (!error) {
    if (doc.containsKey("hr3") || (doc["name"] && strstr(doc["name"], "NIGHT"))) {
      stateNightBulb = doc.containsKey("hr3") ? doc["hr3"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc.containsKey("hr4") || (doc["name"] && strcmp(doc["name"], "FAN") == 0)) {
      stateFan = doc.containsKey("hr4") ? doc["hr4"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc.containsKey("hr5") || (doc["name"] && strstr(doc["name"], "LIGHT"))) {
      stateStudyLight = doc.containsKey("hr5") ? doc["hr5"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc.containsKey("hr6") || (doc["name"] && strstr(doc["name"], "REGULATOR")) || doc.containsKey("speed")) {
      if (doc.containsKey("speed")) {
        fanSpeed = doc["speed"].as<int>();
      }
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
  Serial.println("   ⚡ ELECTROFIC — ESP32 HARRY ROOM NODE     ");
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
