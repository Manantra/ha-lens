export const sampleAutomation = `alias: Flurlicht nachts
description: Demo automation for HA Lens
triggers:
  - trigger: state
    entity_id: binary_sensor.flur_motion
    to: "on"
conditions:
  - condition: numeric_state
    entity_id: sensor.flur_lux
    below: 10
actions:
  - if:
      - condition: state
        entity_id: person.daniel
        state: home
    then:
      - action: light.turn_on
        target:
          entity_id: light.flur
        data:
          brightness_pct: 30
    else:
      - choose:
          - alias: Night mode
            conditions:
              - condition: state
                entity_id: input_boolean.night_mode
                state: "on"
            sequence:
              - action: notify.mobile_app_phone
                data:
                  message: Bewegung im Flur erkannt
        default:
          - delay: "00:00:02"
          - action: light.turn_off
            target:
              entity_id: light.flur
mode: restart
`;
