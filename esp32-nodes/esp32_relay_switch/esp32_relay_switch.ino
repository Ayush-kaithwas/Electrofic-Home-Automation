/*
 * ESP32 Smart Home Relay Node Firmware
 * ------------------------------------
 * Connects to local Wi-Fi and Raspberry Pi MQTT Broker.
 * Receives appliance control commands and reports relay/sensor state.
 *
 * Required Libraries (Arduino IDE Library Manager):
 * - PubSubClient (by Nick O'Leary)
 * - ArduinoJson (by Benoit Blanchon)
 */

#include <ArduinoJson.h>
#include <PubSubClient.h>
#include <WiFi.h>


// --- CONFIGURATION ---
const char *WIFI_SSID = "YOUR_WIFI_SSID";
const char *WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// IP Address of your Raspberry Pi running Mosquitto MQTT Broker
const char *MQTT_SERVER = "192.168.1.100";
const int MQTT_PORT = 1883;

// Unique Identifier for this ESP32 Node
const char *NODE_ID = "living_room_node";

// Topic definitions
// Subscribes to: home/nodes/living_room_node/set
// Publishes to:  home/nodes/living_room_node/telemetry
String topicSet = String("home/nodes/") + NODE_ID + "/set";
String topicTelemetry = String("home/nodes/") + NODE_ID + "/telemetry";

// GPIO Pin mappings for Relays / Appliances
const int RELAY_1_PIN = 25; // Appliance 1 (e.g. Light 1)
const int RELAY_2_PIN = 26; // Appliance 2 (e.g. Fan)
const int RELAY_3_PIN = 27; // Appliance 3 (e.g. Light 2)
const int RELAY_4_PIN = 14; // Appliance 4 (e.g. AC / Socket)

// Relay state variables (Active Low or Active High depending on relay module)
#define RELAY_ON LOW
#define RELAY_OFF HIGH

bool relay1State = false;
bool relay2State = false;
bool relay3State = false;
bool relay4State = false;

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastTelemetryTime = 0;
const unsigned long TELEMETRY_INTERVAL = 10000; // Publish status every 10 sec

void setupPins() {
  pinMode(RELAY_1_PIN, OUTPUT);
  pinMode(RELAY_2_PIN, OUTPUT);
  pinMode(RELAY_3_PIN, OUTPUT);
  pinMode(RELAY_4_PIN, OUTPUT);

  // Set default state OFF
  digitalWrite(RELAY_1_PIN, RELAY_OFF);
  digitalWrite(RELAY_2_PIN, RELAY_OFF);
  digitalWrite(RELAY_3_PIN, RELAY_OFF);
  digitalWrite(RELAY_4_PIN, RELAY_OFF);
}

void setupWiFi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWi-Fi Connected!");
  Serial.print("ESP32 IP Address: ");
  Serial.println(WiFi.localIP());
}

void publishTelemetry() {
  // ArduinoJson v7+ dynamic document (compatible with v6 & v7)
  JsonDocument doc;
  doc["node_id"] = NODE_ID;
  doc["ip"] = WiFi.localIP().toString();
  doc["rssi"] = WiFi.RSSI();

  doc["relays"]["relay1"] = relay1State;
  doc["relays"]["relay2"] = relay2State;
  doc["relays"]["relay3"] = relay3State;
  doc["relays"]["relay4"] = relay4State;

  char jsonBuffer[256];
  serializeJson(doc, jsonBuffer, sizeof(jsonBuffer));

  client.publish(topicTelemetry.c_str(), jsonBuffer);
  Serial.print("Published Telemetry: ");
  Serial.println(jsonBuffer);
}

void applyRelayState(int pin, bool state) {
  digitalWrite(pin, state ? RELAY_ON : RELAY_OFF);
}

void mqttCallback(char *topic, byte *message, unsigned int length) {
  String messageStr = "";
  for (unsigned int i = 0; i < length; i++) {
    messageStr += (char)message[i];
  }

  Serial.print("MQTT Command arrived [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(messageStr);

  // Parse payload JSON or plain text commands
  JsonDocument doc;
  DeserializationError error = deserializeJson(doc, messageStr);

  if (!error) {
    if (!doc["relay1"].isNull()) {
      relay1State = doc["relay1"].as<bool>();
      applyRelayState(RELAY_1_PIN, relay1State);
    }
    if (!doc["relay2"].isNull()) {
      relay2State = doc["relay2"].as<bool>();
      applyRelayState(RELAY_2_PIN, relay2State);
    }
    if (!doc["relay3"].isNull()) {
      relay3State = doc["relay3"].as<bool>();
      applyRelayState(RELAY_3_PIN, relay3State);
    }
    if (!doc["relay4"].isNull()) {
      relay4State = doc["relay4"].as<bool>();
      applyRelayState(RELAY_4_PIN, relay4State);
    }
  } else {
    // Handle simple text commands e.g. "RELAY1_ON"
    if (messageStr == "RELAY1_ON") {
      relay1State = true;
      applyRelayState(RELAY_1_PIN, true);
    } else if (messageStr == "RELAY1_OFF") {
      relay1State = false;
      applyRelayState(RELAY_1_PIN, false);
    }
  }

  // Immediately report updated state back
  publishTelemetry();
}

void reconnectMQTT() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection to RPi Gateway...");

    if (client.connect(NODE_ID)) {
      Serial.println(" Connected!");
      // Subscribe to command topic
      client.subscribe(topicSet.c_str());
      Serial.print("Subscribed to: ");
      Serial.println(topicSet);

      // Publish initial state
      publishTelemetry();
    } else {
      Serial.print(" Failed, rc=");
      Serial.print(client.state());
      Serial.println(" Retrying in 5 seconds...");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  setupPins();
  setupWiFi();

  client.setServer(MQTT_SERVER, MQTT_PORT);
  client.setCallback(mqttCallback);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    setupWiFi();
  }

  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();

  // Periodically send heartbeat/telemetry
  unsigned long now = millis();
  if (now - lastTelemetryTime > TELEMETRY_INTERVAL) {
    lastTelemetryTime = now;
    publishTelemetry();
  }
}
