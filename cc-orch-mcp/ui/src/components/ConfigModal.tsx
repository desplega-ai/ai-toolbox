import { useState, useEffect } from "react";
import Modal from "@mui/joy/Modal";
import ModalDialog from "@mui/joy/ModalDialog";
import Typography from "@mui/joy/Typography";
import Input from "@mui/joy/Input";
import Button from "@mui/joy/Button";
import FormControl from "@mui/joy/FormControl";
import FormLabel from "@mui/joy/FormLabel";
import Stack from "@mui/joy/Stack";
import Box from "@mui/joy/Box";
import Divider from "@mui/joy/Divider";
import { getConfig, saveConfig, resetConfig, getDefaultConfig } from "../lib/config";

interface ConfigModalProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  blocking?: boolean;
}

export default function ConfigModal({ open, onClose, onSave, blocking }: ConfigModalProps) {
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    if (open) {
      const config = getConfig();
      setApiUrl(config.apiUrl);
      setApiKey(config.apiKey);
    }
  }, [open]);

  const handleSave = () => {
    saveConfig({ apiUrl, apiKey });
    onSave();
  };

  const handleReset = () => {
    const defaults = getDefaultConfig();
    setApiUrl(defaults.apiUrl);
    setApiKey(defaults.apiKey);
    resetConfig();
  };

  return (
    <Modal open={open} onClose={blocking ? undefined : onClose}>
      <ModalDialog
        sx={{
          bgcolor: "background.surface",
          border: "1px solid",
          borderColor: "neutral.700",
          boxShadow: "0 0 40px rgba(0, 255, 136, 0.1)",
          minWidth: 400,
        }}
      >
        <Typography
          level="h4"
          sx={{
            fontFamily: "code",
            color: "primary.500",
            textShadow: "0 0 10px rgba(0, 255, 136, 0.5)",
          }}
        >
          ⚡ CONFIGURATION
        </Typography>

        <Divider sx={{ my: 2, bgcolor: "neutral.700" }} />

        <Stack spacing={2}>
          <FormControl>
            <FormLabel sx={{ fontFamily: "code", color: "text.secondary" }}>
              API URL
            </FormLabel>
            <Input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="https://desplega.sh"
              sx={{
                fontFamily: "code",
                bgcolor: "background.level1",
                "&:focus-within": {
                  borderColor: "primary.500",
                  boxShadow: "0 0 10px rgba(0, 255, 136, 0.3)",
                },
              }}
            />
          </FormControl>

          <FormControl>
            <FormLabel sx={{ fontFamily: "code", color: "text.secondary" }}>
              API KEY (optional)
            </FormLabel>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key if required"
              sx={{
                fontFamily: "code",
                bgcolor: "background.level1",
                "&:focus-within": {
                  borderColor: "primary.500",
                  boxShadow: "0 0 10px rgba(0, 255, 136, 0.3)",
                },
              }}
            />
          </FormControl>
        </Stack>

        <Divider sx={{ my: 2, bgcolor: "neutral.700" }} />

        <Box sx={{ display: "flex", gap: 1, justifyContent: "space-between" }}>
          <Button
            variant="outlined"
            color="neutral"
            onClick={handleReset}
            sx={{
              fontFamily: "code",
              borderColor: "neutral.600",
              "&:hover": {
                borderColor: "warning.500",
                color: "warning.500",
              },
            }}
          >
            RESET DEFAULTS
          </Button>
          <Box sx={{ display: "flex", gap: 1 }}>
            {!blocking && (
              <Button
                variant="outlined"
                color="neutral"
                onClick={onClose}
                sx={{
                  fontFamily: "code",
                  borderColor: "neutral.600",
                }}
              >
                CANCEL
              </Button>
            )}
            <Button
              onClick={handleSave}
              sx={{
                fontFamily: "code",
                bgcolor: "primary.500",
                color: "black",
                fontWeight: 700,
                "&:hover": {
                  bgcolor: "primary.400",
                  boxShadow: "0 0 20px rgba(0, 255, 136, 0.5)",
                },
              }}
            >
              CONNECT
            </Button>
          </Box>
        </Box>
      </ModalDialog>
    </Modal>
  );
}
