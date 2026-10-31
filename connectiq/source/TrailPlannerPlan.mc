import Toybox.Lang;

// Le plan collé dans les réglages du champ (code « TP1 » généré par Ravitime, lib/ciq.ts sur le site).
// Mêmes calculs que lib/ciq.ts, qui en est la référence testée.
//
// Format : TP1;<heure du départ, minutes>;<km-effort cumulé à chaque km, en dixièmes>;<ravitos>
// Ravito : nom~km (dixièmes)~arrivée~départ (minutes depuis le départ)~à faire (séparés par ^), séparés par |.

class TrailPlannerRavito {
    var name as String;
    var km as Float;
    var arr as Float;
    var dep as Float;
    var todo as Array<String>;

    function initialize(name as String, km as Float, arr as Float, dep as Float, todo as Array<String>) {
        self.name = name;
        self.km = km;
        self.arr = arr;
        self.dep = dep;
        self.todo = todo;
    }
}

// Zone autour d'un ravito où l'on considère le coureur arrêté au ravito (km).
const AT_RAVITO_KM = 0.1;

class TrailPlannerPlan {
    var startClock as Number = 0;
    var effort as Array<Float> = [] as Array<Float>;
    var ravitos as Array<TrailPlannerRavito> = [] as Array<TrailPlannerRavito>;

    function initialize() {
    }

    // null si le code est vide ou abîmé (mal copié, tronqué).
    static function parse(code as String) as TrailPlannerPlan or Null {
        var parts = $.tpSplit(code, ";");
        if (parts.size() != 4 || !parts[0].equals("TP1")) {
            return null;
        }
        var plan = new TrailPlannerPlan();
        var start = parts[1].toNumber();
        if (start == null) {
            return null;
        }
        plan.startClock = start;
        var values = $.tpSplit(parts[2], ",");
        for (var i = 0; i < values.size(); i++) {
            var v = values[i].toNumber();
            if (v == null) {
                return null;
            }
            plan.effort.add(v / 10.0);
        }
        var items = $.tpSplit(parts[3], "|");
        for (var i = 0; i < items.size(); i++) {
            var f = $.tpSplit(items[i], "~");
            if (f.size() < 4) {
                return null;
            }
            var km = f[1].toNumber();
            var arr = f[2].toNumber();
            var dep = f[3].toNumber();
            if (km == null || arr == null || dep == null) {
                return null;
            }
            var todo = (f.size() > 4 && f[4].length() > 0) ? $.tpSplit(f[4], "^") : [] as Array<String>;
            plan.ravitos.add(new TrailPlannerRavito(f[0], km / 10.0, arr.toFloat(), dep.toFloat(), todo));
        }
        if (plan.ravitos.size() < 2 || plan.effort.size() < 1) {
            return null;
        }
        return plan;
    }

    // Km-effort cumulé (1 km + 1 par 100 m de D+) au km donné, interpolé dans la table.
    function effortAt(km as Float) as Float {
        var n = effort.size();
        if (km <= 0) {
            return effort[0];
        }
        var i = km.toNumber();
        if (i >= n - 1) {
            return effort[n - 1] + (km - (n - 1));
        }
        return effort[i] + (effort[i + 1] - effort[i]) * (km - i);
    }

    // Écart au plan en minutes (positif = retard), avec `km` parcourus en `elapsed` minutes.
    // Au ravito, l'arrêt prévu ne compte pas comme du retard ; entre deux ravitos, le temps prévu suit le terrain.
    function gap(km as Float, elapsed as Float) as Float {
        for (var i = 0; i < ravitos.size(); i++) {
            var r = ravitos[i];
            if ((km - r.km).abs() <= $.AT_RAVITO_KM) {
                if (elapsed < r.arr) {
                    return elapsed - r.arr;
                }
                if (elapsed <= r.dep) {
                    return 0.0;
                }
                return elapsed - r.dep;
            }
        }
        var last = ravitos.size() - 1;
        for (var i = 1; i <= last; i++) {
            if (km < ravitos[i].km || i == last) {
                var a = ravitos[i - 1];
                var b = ravitos[i];
                var e0 = effortAt(a.km);
                var total = effortAt(b.km) - e0;
                var share = 0.0;
                if (total > 0) {
                    share = (effortAt(km) - e0) / total;
                    if (share < 0) {
                        share = 0.0;
                    } else if (share > 1) {
                        share = 1.0;
                    }
                }
                return elapsed - (a.dep + (b.arr - a.dep) * share);
            }
        }
        return 0.0;
    }

    // Index du prochain ravito (au-delà de celui où l'on est), ou le dernier.
    function nextIndex(km as Float) as Number {
        for (var i = 1; i < ravitos.size(); i++) {
            if (ravitos[i].km > km + $.AT_RAVITO_KM) {
                return i;
            }
        }
        return ravitos.size() - 1;
    }

    // « 21h49 » : heure de la journée, `minutes` après le départ.
    function clock(minutes as Float) as String {
        var m = (startClock + minutes.toNumber()) % 1440;
        if (m < 0) {
            m += 1440;
        }
        return (m / 60).toString() + "h" + (m % 60).format("%02d");
    }
}

// Découpe `text` à chaque `sep` (Monkey C n'a pas de split).
function tpSplit(text as String, sep as String) as Array<String> {
    var out = [] as Array<String>;
    var rest = text;
    while (true) {
        var i = rest.find(sep);
        if (i == null) {
            out.add(rest);
            break;
        }
        out.add(rest.substring(0, i) as String);
        rest = rest.substring(i + sep.length(), rest.length()) as String;
    }
    return out;
}
