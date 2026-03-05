// Entry point for the build script in your package.json
import "@hotwired/turbo-rails"
import "./controllers"
import connectionMonitor from "./services/connection_monitor"

connectionMonitor.start()
