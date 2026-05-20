package com.astock.trainer;

import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Capacitor 插件，暴露 Widget 更新能力给前端。
 * 前端通过 Widget.updatePrediction() 调用，数据写入 SharedPreferences
 * 供 PredictionWidgetProvider 读取并刷新桌面小卡片。
 */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {

    @PluginMethod()
    public void updatePrediction(PluginCall call) {
        String stock = call.getString("stock", "暂无预测");
        String direction = call.getString("direction", "📈");
        String confidence = call.getString("confidence", "--%");
        String label = call.getString("label", "等待预测...");

        Context context = getContext();
        PredictionWidgetProvider.savePrediction(context, stock, direction, confidence, label);

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }
}
