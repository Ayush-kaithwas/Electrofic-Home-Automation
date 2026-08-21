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
 *   - Subscribes to: home/nodes/all/scene (Broadcast scenes: ALL_OFF, NIGHT_MODE)
 *   - Publishes to:  home/nodes/first_floor/telemetry
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
const char* NODE_ID       = "first_floor";        // Node identifier matching Firebase

// MQTT Topic Definitions
const char* TOPIC_SET       = "home/nodes/first_floor/set";
const char* TOPIC_SCENE     = "home/nodes/all/scene";
const char* TOPIC_TELEMETRY = "home/nodes/first_floor/telemetry";

// ==============================================================================
// 2. HARDWARE PIN DEFINITIONS
// ==============================================================================
#define PIN_NIGHT_BULB  25   // f2: Night Bulb
#define PIN_FAN_RELAY   26   // f4: Fan Power Relay
#define PIN_FAN_PWM     18   // f4: Fan Speed Regulator (PWM channel)
#define PIN_LIGHT       27   // f5: Main Light
#define PIN_CHANDELIER  14   // f6: Chandelier

#define RELAY_ON        LOW
#define RELAY_OFF       HIGH

// PWM Channel configuration for Fan Speed (Levels 1 - 5)
const int PWM_CHANNEL    = 0;
const int PWM_FREQ       = 5000; // 5 kHz
const int PWM_RESOLUTION = 8;    // 8-bit (0 - 255)

// Appliance States
bool stateNightBulb  = true;
bool stateFan        = true;
int  fanSpeed        = 3;     // Level 1 to 5
bool stateLight      = false;
bool stateChandelier = false;

// Environmental Data
float ambientTemp     = 25.1;
float ambientHumidity = 55.0;

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

  // Convert Speed 1-5 to PWM Duty Cycle (80 to 255)
  int dutyCycle = map(speedLevel, 1, 5, 80, 255);
  if (!stateFan) dutyCycle = 0;

  ledcWrite(PWM_CHANNEL, dutyCycle);
  Serial.printf("[FAN] Speed set to Level %d (PWM Duty: %d/255)\n", fanSpeed, dutyCycle);
}

void applyRelayStates() {
  digitalWrite(PIN_NIGHT_BULB, stateNightBulb  ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_FAN_RELAY,  stateFan        ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_LIGHT,      stateLight      ? RELAY_ON : RELAY_OFF);
  digitalWrite(PIN_CHANDELIER, stateChandelier ? RELAY_ON : RELAY_OFF);

  applyFanSpeed(fanSpeed);
}

void initPins() {
  pinMode(PIN_NIGHT_BULB, OUTPUT);
  pinMode(PIN_FAN_RELAY, OUTPUT);
  pinMode(PIN_LIGHT, OUTPUT);
  pinMode(PIN_CHANDELIER, OUTPUT);

  // Setup PWM timer for fan regulator
  ledcSetup(PWM_CHANNEL, PWM_FREQ, PWM_RESOLUTION);
  ledcAttachPin(PIN_FAN_PWM, PWM_CHANNEL);

  applyRelayStates();
}

// ==============================================================================
// 4. TELEMETRY PUBLISHER
// ==============================================================================
void publishTelemetry() {
  StaticJsonDocument<512> doc;
  doc["node_id"]   = NODE_ID;
  doc["room"]      = "First Floor Room";
  doc["ip"]        = WiFi.localIP().toString();
  doc["rssi"]      = WiFi.RSSI();
  doc["status"]    = "online";
  doc["uptime_s"]  = millis() / 1000;

  JsonObject relays = doc.createNestedObject("relays");
  relays["f2_night_bulb"] = stateNightBulb;
  relays["f4_fan"]        = stateFan;
  relays["f4_fan_speed"]  = fanSpeed;
  relays["f5_light"]      = stateLight;
  relays["f6_chandelier"] = stateChandelier;

  doc["temperature"] = ambientTemp;
  doc["humidity"]    = ambientHumidity;

  char buffer[512];
  size_t n = serializeJson(doc, buffer);
  mqttClient.publish(TOPIC_TELEMETRY, buffer, n);
  Serial.print("[MQTT PUB] Telemetry sent: ");
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
    if (doc.containsKey("f2") || (doc["name"] && strstr(doc["name"], "NIGHT"))) {
      stateNightBulb = doc.containsKey("f2") ? doc["f2"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc.containsKey("f4") || (doc["name"] && strstr(doc["name"], "FAN"))) {
      stateFan = doc.containsKey("f4") ? doc["f4"].as<bool>() : doc["state"].as<bool>();
      if (doc.containsKey("speed")) {
        fanSpeed = doc["speed"].as<int>();
      }
    }
    if (doc.containsKey("f5") || (doc["name"] && strstr(doc["name"], "LIGHT"))) {
      stateLight = doc.containsKey("f5") ? doc["f5"].as<bool>() : doc["state"].as<bool>();
    }
    if (doc.containsKey("f6") || (doc["name"] && strstr(doc["name"], "CHANDELIER"))) {
      stateChandelier = doc.containsKey("f6") ? doc["f6"].as<bool>() : doc["state"].as<bool>();
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
  Serial.println(" ⚡ ELECTROFIC — ESP32 FIRST FLOOR ROOM NODE  ");
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
