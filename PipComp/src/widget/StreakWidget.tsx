import React from 'react';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';

export interface StreakWidgetProps {
  streak: number;
  dots: boolean[];
  coverage: number;
}

const FLAME_SVG = `
<svg width="22" height="26" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M9 1C9 1 14.5 6.5 14.5 11.5C14.5 15 12 17.5 9 17.5C6 17.5 3.5 15 3.5 11.5C3.5 8.5 5.5 6.5 5.5 6.5C5.5 6.5 6 9.5 9 9.5C9 9.5 7.5 7.5 9 4C9.5 5.5 11.5 7.5 11.5 9.5C13 8 12.5 5.5 11 3.5C14 5.5 15.5 8.5 15.5 11.5C15.5 16.5 12.5 20.5 9 21.5C5.5 20.5 2.5 16.5 2.5 11.5C2.5 5.5 9 1 9 1Z" fill="#9c6300" />
  <path d="M9 13.5C9 13.5 11 12 11 10.5C10.5 11.5 9 11.5 9 11.5C9 11.5 9.5 10 9 9C8.5 10 7 11.5 7 12.5C7 13.6 7.9 14.5 9 14.5C8.7 14 9 13.5 9 13.5Z" fill="#FAC438" />
</svg>
`.trim();

const ACTIVE_DOT_SVG = `
<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="6" cy="6" r="5.5" fill="#1f8a5b" />
  <path d="M3.2 6.2l1.9 2 3.8-4.2" stroke="#ffffff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
</svg>
`.trim();

const INACTIVE_DOT_SVG = `
<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="6" cy="6" r="4.5" fill="#f6f8f6" stroke="#9aa7a0" stroke-width="1.4" />
</svg>
`.trim();

const REFRESH_SVG = `
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5d6b63" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
  <path d="M21 3v5h-5"/>
  <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
  <path d="M3 21v-5h5"/>
</svg>
`.trim();

export function StreakWidget({ streak, dots, coverage }: StreakWidgetProps) {
  // Ensure dots is always 7 items
  const safeDots = dots.length === 7 ? dots : [...Array(7)].map((_, i) => dots[i] ?? false);

  return (
    <FlexWidget
      style={{
        width: 'match_parent',
        height: 'match_parent',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        borderRadius: 16,
        paddingHorizontal: 12,
        paddingVertical: 8,
      }}
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'pip://add' }}
    >
      {/* Left side: Flame + Streak count */}
      <FlexWidget
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          flexGap: 8,
        }}
      >
        <FlexWidget
          style={{
            width: 32,
            height: 32,
            backgroundColor: '#faf7f2',
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SvgWidget
            svg={FLAME_SVG}
            style={{
              width: 18,
              height: 22,
            }}
          />
        </FlexWidget>

        <FlexWidget
          style={{
            flexDirection: 'column',
            justifyContent: 'center',
          }}
        >
          <TextWidget
            text={String(streak)}
            style={{
              fontSize: 20,
              fontWeight: 'bold',
              color: '#16201b',
            }}
          />
          <TextWidget
            text="day streak"
            style={{
              fontSize: 10,
              fontWeight: '500',
              color: '#5d6b63',
            }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* Divider */}
      <FlexWidget
        style={{
          width: 1,
          height: 36,
          backgroundColor: '#eef1ee',
          marginHorizontal: 10,
        }}
      />

      {/* Right side: 7-day dots, refresh button & coverage */}
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: 'match_parent',
          paddingVertical: 2,
        }}
      >
        {/* Top row: 7 dots + refresh button */}
        <FlexWidget
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <FlexWidget
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              flexGap: 3,
            }}
          >
            {safeDots.map((done, idx) => (
              <SvgWidget
                key={idx}
                svg={done ? ACTIVE_DOT_SVG : INACTIVE_DOT_SVG}
                style={{
                  width: 11,
                  height: 11,
                }}
              />
            ))}
          </FlexWidget>

          <FlexWidget
            style={{
              width: 20,
              height: 20,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              backgroundColor: '#f6f8f6',
            }}
            clickAction="REFRESH_WIDGET"
          >
            <SvgWidget
              svg={REFRESH_SVG}
              style={{
                width: 12,
                height: 12,
              }}
            />
          </FlexWidget>
        </FlexWidget>

        {/* Bottom row: Coverage text */}
        <FlexWidget
          style={{
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          <TextWidget
            text={`Covered ${coverage}/90 days`}
            style={{
              fontSize: 10,
              fontWeight: '500',
              color: '#5d6b63',
            }}
          />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
