package com.astock.trainer;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 桌面小卡片 Provider，负责展示最新股票预测结果。
 * 数据通过 SharedPreferences 与 WidgetPlugin 共享，
 * 前端调用 Widget.updatePrediction() 时写入，Widget 刷新时读取。
 */
public class PredictionWidgetProvider extends AppWidgetProvider {

    private static final String PREFS_NAME = "prediction_widget";
    private static final String KEY_STOCK = "latest_stock";
    private static final String KEY_DIRECTION = "latest_direction";
    private static final String KEY_CONFIDENCE = "latest_confidence";
    private static final String KEY_LABEL = "latest_label";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    /**
     * 读取 SharedPreferences 中的预测数据并刷新单个 Widget 实例的 UI。
     */
    static void updateWidget(Context context, AppWidgetManager appWidgetManager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);

        String stock = prefs.getString(KEY_STOCK, "暂无预测");
        String direction = prefs.getString(KEY_DIRECTION, "📈");
        String confidence = prefs.getString(KEY_CONFIDENCE, "--%");
        String label = prefs.getString(KEY_LABEL, "等待预测...");

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_prediction);

        views.setTextViewText(R.id.widget_stock, stock);
        views.setTextViewText(R.id.widget_direction, direction);
        views.setTextViewText(R.id.widget_confidence, confidence);
        views.setTextViewText(R.id.widget_label, label);

        SimpleDateFormat sdf = new SimpleDateFormat("HH:mm", Locale.getDefault());
        views.setTextViewText(R.id.widget_time, sdf.format(new Date()));

        // 点击小卡片打开主应用
        Intent intent = new Intent(context, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context, 0, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_stock, pendingIntent);

        appWidgetManager.updateAppWidget(appWidgetId, views);
    }

    /**
     * 供 WidgetPlugin 调用，将前端传来的预测数据持久化到 SharedPreferences。
     */
    public static void savePrediction(Context context, String stock, String direction, String confidence, String label) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putString(KEY_STOCK, stock);
        editor.putString(KEY_DIRECTION, direction);
        editor.putString(KEY_CONFIDENCE, confidence);
        editor.putString(KEY_LABEL, label);
        editor.apply();
    }
}
