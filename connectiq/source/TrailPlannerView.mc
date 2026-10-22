import Toybox.Activity;
import Toybox.Application;
import Toybox.Attention;
import Toybox.Graphics;
import Toybox.Lang;
import Toybox.WatchUi;

// Distance (km) avant un ravito à partir de laquelle le champ passe en « à faire » et vibre.
const APPROACH_KM = 0.3;

// Le champ : prochain ravito du plan, distance, heure d'arrivée estimée et écart au plan.
// Plein écran ou en version compacte selon la place ; à 300 m d'un ravito, ce qu'il y a à y faire.
class TrailPlannerView extends WatchUi.DataField {
    var plan as TrailPlannerPlan?;
    var km as Float = 0.0;
    var elapsed as Float = 0.0;
    var started as Boolean = false;
    // Dernier ravito annoncé par une vibration (pour ne vibrer qu'une fois).
    var alerted as Number = -1;

    function initialize() {
        DataField.initialize();
        loadPlan();
    }

    function loadPlan() as Void {
        var code = Application.Properties.getValue("planCode");
        plan = (code instanceof String) ? TrailPlannerPlan.parse(code as String) : null;
        alerted = -1;
    }

    function compute(info as Activity.Info) as Void {
        var d = info.elapsedDistance;
        var t = info.elapsedTime;
        started = d != null && t != null;
        if (!started) {
            return;
        }
        km = (d as Float) / 1000.0;
        elapsed = (t as Number) / 60000.0;
        if (plan != null) {
            var p = plan as TrailPlannerPlan;
            var i = p.nextIndex(km);
            if (i != alerted && p.ravitos[i].km - km <= $.APPROACH_KM && (Attention has :vibrate)) {
                alerted = i;
                Attention.vibrate([new Attention.VibeProfile(60, 700)]);
            }
        }
    }

    function onUpdate(dc as Graphics.Dc) as Void {
        var bg = getBackgroundColor();
        var fg = bg == Graphics.COLOR_BLACK ? Graphics.COLOR_WHITE : Graphics.COLOR_BLACK;
        dc.setColor(fg, bg);
        dc.clear();
        var w = dc.getWidth();
        var h = dc.getHeight();
        var cx = w / 2;
        var center = Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER;

        if (plan == null) {
            dc.drawText(cx, h * 0.4, Graphics.FONT_TINY, "Trail Planner", center);
            dc.drawText(cx, h * 0.6, Graphics.FONT_XTINY, "Colle le code du plan", center);
            return;
        }
        var p = plan as TrailPlannerPlan;
        var i = p.nextIndex(km);
        var r = p.ravitos[i];
        var dist = r.km - km;
        if (dist < 0) {
            dist = 0.0;
        }
        var gap = started ? p.gap(km, elapsed) : 0.0;
        var eta = p.clock(r.arr + gap);
        var full = h > 150;

        // À l'approche d'un ravito : ce qu'il y a à y faire.
        if (full && started && dist <= $.APPROACH_KM && r.todo.size() > 0) {
            dc.setColor(Graphics.COLOR_GREEN, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h * 0.2, Graphics.FONT_XTINY, "RAVITO DANS " + (dist * 1000).toNumber() + " M", center);
            dc.setColor(fg, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h * 0.32, Graphics.FONT_SMALL, r.name, center);
            var y = h * 0.45;
            var step = h * 0.11;
            for (var k = 0; k < r.todo.size() && k < 4; k++) {
                dc.drawText(cx, y + k * step, Graphics.FONT_XTINY, r.todo[k], center);
            }
            return;
        }

        var gapColor = gap > 1 ? Graphics.COLOR_ORANGE : Graphics.COLOR_GREEN;
        if (full) {
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h * 0.2, Graphics.FONT_XTINY, "PROCHAIN RAVITO", center);
            dc.setColor(fg, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h * 0.34, Graphics.FONT_MEDIUM, r.name, center);
            dc.setColor(Graphics.COLOR_BLUE, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w * 0.36, h * 0.53, Graphics.FONT_NUMBER_MILD, formatKm(dist), center);
            dc.setColor(fg, Graphics.COLOR_TRANSPARENT);
            dc.drawText(w * 0.7, h * 0.53, Graphics.FONT_MEDIUM, eta, center);
            dc.setColor(Graphics.COLOR_LT_GRAY, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h * 0.68, Graphics.FONT_XTINY, "km  ·  prévu " + p.clock(r.arr), center);
            dc.setColor(gapColor, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h * 0.8, Graphics.FONT_TINY, started ? gapText(gap) : "au départ", center);
        } else {
            dc.drawText(cx, h * 0.3, Graphics.FONT_SMALL, r.name + " " + formatKm(dist), center);
            dc.setColor(gapColor, Graphics.COLOR_TRANSPARENT);
            dc.drawText(cx, h * 0.7, Graphics.FONT_SMALL, eta + " " + gapShort(gap), center);
        }
    }

    // « 4,2 »
    function formatKm(value as Float) as String {
        var s = value.format("%.1f");
        var i = s.find(".");
        return i == null ? s : s.substring(0, i) + "," + s.substring(i + 1, s.length());
    }

    // « 12 min d'avance », « 1h05 de retard », « pile à l'heure »
    function gapText(gap as Float) as String {
        if (gap.abs() < 1) {
            return "pile à l'heure";
        }
        return duration(gap.abs()) + (gap < 0 ? " d'avance" : " de retard");
    }

    // « -12 », « +1h05 », « = »
    function gapShort(gap as Float) as String {
        if (gap.abs() < 1) {
            return "=";
        }
        return (gap < 0 ? "-" : "+") + duration(gap.abs());
    }

    function duration(minutes as Float) as String {
        var m = minutes.toNumber();
        if (m < 60) {
            return m.toString() + " min";
        }
        return (m / 60).toString() + "h" + (m % 60).format("%02d");
    }
}
