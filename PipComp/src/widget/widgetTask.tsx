import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { StreakWidget } from './StreakWidget';
import { getStreakWidgetData } from './syncStreakWidget';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const { widgetInfo, widgetAction, clickAction, renderWidget } = props;

  if (widgetInfo.widgetName !== 'StreakWidget') {
    return;
  }

  switch (widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED': {
      const data = await getStreakWidgetData();
      renderWidget(
        <StreakWidget
          streak={data.streak}
          dots={data.dots}
          coverage={data.coverage}
        />
      );
      break;
    }

    case 'WIDGET_CLICK': {
      if (clickAction === 'REFRESH_WIDGET') {
        const data = await getStreakWidgetData();
        renderWidget(
          <StreakWidget
            streak={data.streak}
            dots={data.dots}
            coverage={data.coverage}
          />
        );
      }
      break;
    }

    case 'WIDGET_DELETED':
      // Widget removed from home screen
      break;

    default:
      break;
  }
}
