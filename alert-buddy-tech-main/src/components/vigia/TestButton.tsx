import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { receberAlertaSOS } from "@/lib/sos-api";

export function TestButton() {
  const handleTestAlert = async () => {
    const testAlert = {
      tipo: "ACIDENTE" as const,
      mensagem: "Alerta de teste: possível acidente detectado pelo SOS Vision.",
      data_hora: new Date().toISOString(),
      cidade: "Belém",
      regiao: "Pará",
      pais: "Brasil",
      latitude: -1.4558,
      longitude: -48.4902,
      mapa: "https://www.google.com/maps?q=-1.4558,-48.4902",
    };

    try {
      const result = await receberAlertaSOS({ data: testAlert });
      toast.success("Alerta de teste enviado com sucesso!", {
        description: "Verifique se ele apareceu na lista de alertas SOS.",
      });
    } catch (error) {
      console.error("Erro ao enviar alerta de teste:", error);
      toast.error("Erro ao enviar alerta de teste", {
        description: error instanceof Error ? error.message : "Erro desconhecido",
      });
    }
  };

  return (
    <Button onClick={handleTestAlert} variant="outline" size="sm" className="gap-2">
      <Zap className="size-4" />
      Testar Alerta SOS
    </Button>
  );
}
