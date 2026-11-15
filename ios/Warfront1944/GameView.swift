import SwiftUI
import UIKit
import WebKit

struct GameView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> GameViewController {
        GameViewController()
    }

    func updateUIViewController(_ uiViewController: GameViewController, context: Context) {}
}

final class GameViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private var webView: WKWebView!

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }
    override var preferredInterfaceOrientationForPresentation: UIInterfaceOrientation { .landscapeRight }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.isElementFullscreenEnabled = true

        let nativeBootstrap = """
        window.WARFRONT_NATIVE = true;
        document.documentElement.classList.add('native-app');
        """
        configuration.userContentController.addUserScript(
            WKUserScript(source: nativeBootstrap, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        )
        let nativePolish = """
        (() => {
          document.body.classList.add('native-app');
          const style = document.createElement('style');
          style.textContent = '#fsBtn,#srcBtn,.lic,.credit,#pwaCard,#pwaOffer,#deckCard{display:none!important}';
          document.head.appendChild(style);
        })();
        """
        configuration.userContentController.addUserScript(
            WKUserScript(source: nativePolish, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsBackForwardNavigationGestures = false
        webView.allowsLinkPreview = false

        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        loadGame()
    }

    private func loadGame() {
        guard
            let gameFolder = Bundle.main.url(forResource: "dist", withExtension: nil),
            let gamePage = Bundle.main.url(
                forResource: "riposte-frontline",
                withExtension: "html",
                subdirectory: "dist"
            )
        else {
            showMissingBuild()
            return
        }

        webView.loadFileURL(gamePage, allowingReadAccessTo: gameFolder)
    }

    private func showMissingBuild() {
        let message = """
        <html><meta name="viewport" content="width=device-width">
        <body style="margin:0;background:#080a09;color:#e4dbc1;display:grid;place-items:center;height:100vh;font:20px system-ui">
        WARFRONT 1944 assets are missing. Run python3 build.py and rebuild the Xcode target.
        </body></html>
        """
        webView.loadHTMLString(message, baseURL: nil)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if url.isFileURL || navigationAction.navigationType == .reload {
            decisionHandler(.allow)
            return
        }
        if navigationAction.targetFrame?.isMainFrame == true,
           navigationAction.navigationType == .linkActivated {
            UIApplication.shared.open(url)
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            UIApplication.shared.open(url)
        }
        return nil
    }
}
