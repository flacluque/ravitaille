import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

class TrailPlannerApp extends Application.AppBase {
    var view as TrailPlannerView?;

    function initialize() {
        AppBase.initialize();
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        view = new TrailPlannerView();
        return [view as TrailPlannerView];
    }

    // Nouveau code collé dans l'appli Connect IQ : on relit le plan.
    function onSettingsChanged() as Void {
        if (view != null) {
            (view as TrailPlannerView).loadPlan();
        }
        WatchUi.requestUpdate();
    }
}
