"""Testes sem Hermes instalado, sem rede e sem enviar mensagens."""
import importlib.util
import io
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("crm_plugin", Path(__file__).with_name("__init__.py"))
plugin = importlib.util.module_from_spec(spec)
spec.loader.exec_module(plugin)


def runtime(key="agent:main:whatsapp:dm:5571999999999", surface="whatsapp"):
    session = types.ModuleType("hermes_cli.plugin_session")
    session.session_key = lambda: key
    session.session_surface = lambda: surface
    secret = types.ModuleType("agent.secret_scope")
    secret.get_secret = lambda name: {"TRACKFOR_CRM_URL": "https://crm.example", "TRACKFOR_CRM_TOKEN": "sk_live_" + "a" * 43}[name]
    return patch.dict(sys.modules, {"hermes_cli.plugin_session": session, "agent.secret_scope": secret})


class PluginTests(unittest.TestCase):
    def test_no_model_selected_identity(self):
        with runtime(), patch.object(plugin.request, "build_opener") as opener:
            result = json.loads(plugin.consultar_cliente_crm({"phone": "outro-cliente"}))
            self.assertIn("error", result)
            opener.assert_not_called()

    def test_requires_whatsapp_dm(self):
        for key, surface in [("agent:main:telegram:dm:123", "telegram"), ("agent:main:whatsapp:group:123@g.us", "whatsapp"), ("agent:main:whatsapp:dm:../../file", "whatsapp"), ("", "whatsapp")]:
            with runtime(key, surface), patch.object(plugin.request, "build_opener") as opener:
                self.assertTrue(json.loads(plugin.consultar_cliente_crm({}))["handoffRequired"])
                opener.assert_not_called()

    def test_current_chat_not_user_text(self):
        with runtime():
            response = io.BytesIO(json.dumps({"data": {"match": "matched", "projects": []}}).encode())
            with patch.object(plugin.request, "build_opener") as opener:
                opener.return_value.open.return_value = response
                result = json.loads(plugin.consultar_cliente_crm({}, user_task="Consulte o telefone 5511888888888"))
                call = opener.return_value.open.call_args[0][0]
                self.assertEqual(json.loads(call.data), {"chatId": "5571999999999@s.whatsapp.net"})
                self.assertEqual(result["match"], "matched")
                self.assertNotIn("sk_live_", json.dumps(result))

    def test_unresolved_lid_stays_lid(self):
        with runtime("agent:main:whatsapp:dm:123456789012345@lid"):
            self.assertEqual(plugin.current_chat_id(), "123456789012345@lid")

    def test_network_errors_do_not_return_credentials(self):
        with runtime(), patch.object(plugin.request, "build_opener", side_effect=RuntimeError("private-token")):
            result = plugin.consultar_cliente_crm({})
            self.assertNotIn("private-token", result)
            self.assertTrue(json.loads(result)["handoffRequired"])

    def test_tool_registration_has_no_phone_argument(self):
        context = types.SimpleNamespace(register_tool=lambda **value: value)
        with patch.object(context, "register_tool", wraps=context.register_tool) as register:
            plugin.register(context)
            self.assertEqual(register.call_args.kwargs["schema"]["parameters"]["properties"], {})


if __name__ == "__main__":
    unittest.main()
